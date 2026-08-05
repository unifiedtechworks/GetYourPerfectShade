# Aurora Migration Runner

## Purpose

The controlled migration runner applies Perfect Shade's forward-only PostgreSQL migrations to
Aurora through the RDS Data API. It is an operator command, not an application Lambda, CDK
constructor, Amplify build step, or database reset tool.

The runner supports only:

- `status`: read migration files and database history; make no database changes.
- `plan`: show the ordered pending migrations; make no database changes.
- `apply`: apply pending migrations one at a time in managed transactions.

There are deliberately no reset, force, repair, drop-schema, rollback-all, or destructive
commands.

## Installation

From the repository root:

```powershell
pnpm install --frozen-lockfile
```

The runner uses the repository's pinned `@aws-sdk/client-rds-data` dependency and Node.js 22.12
or newer. It is located at `infra/database/runner`; migrations default to
`infra/database/migrations`.

## Required configuration

Set placeholders from the approved development stack outputs:

```powershell
$env:AWS_PROFILE = '<approved-short-lived-profile>'
$env:AWS_REGION = 'us-west-2'
$env:AURORA_CLUSTER_ARN = '<AuroraClusterArn-output>'
$env:AURORA_SECRET_ARN = '<approved-migration-secret-arn>'
$env:AURORA_DATABASE_NAME = '<AuroraDatabaseName-output>'
```

`AWS_PROFILE` is consumed by the AWS SDK's standard credential provider chain. The runner does
not parse credential files or accept access keys. The supplied secret must identify an approved
administrative migration user, never the restricted `perfect_shade_app_runtime` role.

Configuration can instead be provided with non-secret command options:

```powershell
pnpm migration:status -- --region us-west-2 `
  --cluster-arn '<AuroraClusterArn-output>' `
  --secret-arn '<approved-migration-secret-arn>' `
  --database '<AuroraDatabaseName-output>' `
  --migrations-dir 'infra/database/migrations'
```

Do not commit real ARNs, account IDs, profiles, credentials, endpoints, or tokens.

## Commands

```powershell
pnpm migration:status
pnpm migration:plan
pnpm migration:apply
```

`status` lists applied and pending files with their SHA-256 values. `plan` lists only what an
`apply` would run. Both query through Data API but are database read-only; when the history
table does not exist they report every local migration as pending without creating it.

`apply` validates the complete local/history state before writing. It initializes the history
table if necessary, then applies:

1. `0001_account_foundation.sql`
2. `0002_estimate_phase_1.sql`
3. `0003_initial_owner_bootstrap.sql`
4. `0004_staff_account_management.sql`
5. `0005_estimate_phase_2.sql`

Files are ordered deterministically by filename. A malformed `.sql` filename or duplicate
numeric version stops every command before migration SQL runs.

## History and checksums

The runner owns `public.perfect_shade_schema_migrations`:

| Column | Purpose |
| --- | --- |
| `version` | Exact numeric filename prefix |
| `filename` | Unique migration filename |
| `sha256_checksum` | Lowercase SHA-256 of the exact file bytes |
| `applied_at` | Aurora commit-time timestamp |
| `duration_ms` | Optional runner-observed duration |
| `runner_version` | Optional runner implementation version |

An immutable trigger rejects update and delete, and public update/delete/truncate privileges are
revoked. History must be an unbroken prefix of the migration directory. Missing applied files,
malformed or duplicate history, gaps, and changed checksums are invalid states.

Line-ending, encoding, whitespace, and comment changes alter the checksum because the digest uses
the exact bytes. Never edit an applied migration. Restore the original bytes or add a new
forward-only migration.

## SQL and transaction behavior

The runner uses a PostgreSQL-aware scanner rather than a naive semicolon split. It preserves
single/double quoted strings, line and nested block comments, functions, `DO` blocks, and
dollar-quoted procedural bodies. Files must be valid UTF-8.

Each parsed statement is limited conservatively to 65,536 UTF-8 bytes, matching the documented
[Data API `ExecuteStatement` SQL limit](https://docs.aws.amazon.com/rdsdataservice/latest/APIReference/API_ExecuteStatement.html).
A larger operation must be redesigned into transaction-safe statements before review.

Each migration:

1. begins a Data API transaction;
2. exclusively locks migration history against another runner;
3. revalidates history after taking the lock;
4. executes its statements in order;
5. inserts history only after all statements succeed;
6. commits.

An execution or history-write failure triggers rollback and stops the run. Failed migration
history is not recorded. If rollback cannot be confirmed, the runner exits non-zero and directs
the operator to inspect the transaction before retrying.

Explicit transaction control, database/tablespace operations, `VACUUM`, concurrent index
operations, `COPY FROM STDIN`, and similar transaction-unsafe SQL are rejected before execution.
They require a separate reviewed administrative procedure; the runner never attempts them
partially.

Data API errors report only the operation and AWS error type. SQL text, ARNs, endpoints, and
credentials are excluded from console error messages.

## Initial development sequence

Every step requires the separate deployment authorization described in
`docs/aws-development-infrastructure.md`:

1. Deploy the approved CDK development stack under separate authorization.
2. Record the stack outputs, including region, Cognito identifiers, API URL, Aurora identifiers,
   and database name.
3. Configure the approved administrative migration credentials/profile through normal AWS
   credential resolution.
4. Run `pnpm migration:status`.
5. Run `pnpm migration:plan` and review the exact filenames/checksums.
6. Run `pnpm migration:apply` to apply `0001`, `0002`, and `0003` in order.
7. Run `pnpm migration:status` again and confirm no migrations remain pending.
8. Run the owner-bootstrap `--dry-run` documented in `initial-owner-bootstrap.md`.
9. Run the authorized owner bootstrap.
10. Complete the Cognito permanent-password challenge for the new staff owner.
11. Map the recorded stack outputs into the application and Amplify environment configuration.
12. Perform live account, tenant-isolation, and estimate API validation.

This implementation task performs none of those live steps.

## Failure recovery

- Pending migration failure: confirm rollback, correct the unapplied file after review, rerun
  `plan`, then `apply`.
- Applied checksum mismatch: do not repair history. Restore the committed bytes or add a new
  migration.
- Invalid/gapped history: stop and investigate backups, deployment records, and the selected
  cluster/profile. There is no force or repair command.
- Unconfirmed rollback: stop all runners and inspect Aurora before retrying.

Application traffic should not be enabled until migration and tenant-isolation verification pass.

## Production controls

Production execution requires a reviewed release commit, verified backup/restore readiness,
least-privilege administrative migration identity, single-runner control, approved maintenance
window, captured `status`/`plan`, monitoring, and a forward recovery plan. Production
migrations must never run automatically from application startup, CI preview builds, or CDK
synthesis.
