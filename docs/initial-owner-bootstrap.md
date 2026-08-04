# Initial AWS Owner Bootstrap

This runbook creates the first internal Perfect Shade staff owner after the development AWS stack
has been separately authorized and deployed and all Aurora migrations have been applied. Running
the command mutates Cognito and Aurora. This repository task added and tested the workflow with
mocks only; it did not run the live command.

The command is intentionally not a general membership-management tool. It can create only the
`owner` role and has no role argument.

## Prerequisites

1. The target is an approved Perfect Shade environment in `us-west-2`.
2. Cognito public signup remains disabled (`AllowAdminCreateUserOnly`).
3. Aurora is healthy with the Data API enabled.
4. Migrations `0001`, `0002`, and `0003` are applied in filename order by the controlled
   migration identity.
5. The operator has an approved AWS profile resolved through the normal AWS SDK credential
   chain. Do not create long-lived access keys for this command.
6. The operator is authorized for the specific User Pool, Aurora cluster, and secret. Minimum
   operations include Cognito `AdminGetUser`/`AdminCreateUser`, the RDS Data API transaction
   operations, and access to the named Aurora secret.

## Command and inputs

Run from the repository root:

```powershell
pnpm bootstrap:owner -- `
  --region us-west-2 `
  --user-pool-id "<COGNITO_USER_POOL_ID>" `
  --cluster-arn "<AURORA_CLUSTER_ARN>" `
  --secret-arn "<AURORA_SECRET_ARN>" `
  --database "perfectshade" `
  --owner-email "<OWNER_EMAIL>" `
  --organization-name "<ORGANIZATION_NAME>" `
  --profile "<AWS_PROFILE>"
```

Every value can instead come from the corresponding environment variable:

| Argument | Environment variable | Purpose |
| --- | --- | --- |
| `--region` | `AWS_REGION` | AWS region; approved value is `us-west-2` |
| `--user-pool-id` | `COGNITO_USER_POOL_ID` | Staff User Pool identifier |
| `--cluster-arn` | `DATABASE_CLUSTER_ARN` | Data API Aurora cluster ARN |
| `--secret-arn` | `DATABASE_SECRET_ARN` | Aurora admin/migration secret ARN |
| `--database` | `DATABASE_NAME` | Aurora database name |
| `--owner-email` | `OWNER_EMAIL` | Verified internal staff email |
| `--organization-name` | `ORGANIZATION_NAME` | Initial organization name |
| `--profile` | `AWS_PROFILE` | Approved local AWS profile |

Use `pnpm bootstrap:owner -- --help` for help. Use the following first to validate input syntax
without resolving credentials or contacting AWS:

```powershell
pnpm bootstrap:owner -- --dry-run `
  --region us-west-2 `
  --user-pool-id "<COGNITO_USER_POOL_ID>" `
  --cluster-arn "<AURORA_CLUSTER_ARN>" `
  --secret-arn "<AURORA_SECRET_ARN>" `
  --database "perfectshade" `
  --owner-email "<OWNER_EMAIL>" `
  --organization-name "<ORGANIZATION_NAME>" `
  --profile "<AWS_PROFILE>"
```

Dry-run validates configuration only. It cannot prove AWS permissions, resource availability,
email delivery, migration state, or database connectivity.

## Cognito behavior and temporary password

The command calls `AdminGetUser` before any mutation. When the identity is absent, it calls
`AdminCreateUser` with verified email and email delivery. No temporary password is accepted by
the CLI or environment: Cognito generates it and delivers the invitation. The command never sees
or prints the password.

At first sign-in, Cognito returns `NEW_PASSWORD_REQUIRED`; the existing application flow requires
the staff user to choose a permanent password satisfying the User Pool policy. Public signup and
customer-facing login remain unavailable.

## Aurora transaction

Migration `0003_initial_owner_bootstrap.sql` installs a security-definer function available only
to the admin/migration identity. The normal application runtime role is explicitly denied access.
The command invokes that function inside an explicit Data API transaction.

The function:

- serializes attempts by normalized organization name using a transaction advisory lock;
- checks existing organization, active owner, profile, and membership state;
- hard-codes role `owner` and status `active`;
- creates the organization, Cognito-subject profile, owner membership, and append-only audit event;
- returns a non-destructive duplicate outcome when appropriate.

Any statement failure triggers Data API rollback. A successful duplicate check commits no data
changes. A completed invocation can be rerun safely and reports that bootstrap is already complete.

## Duplicate behavior

- Existing completed owner/profile/membership: success with “already complete”; no writes.
- Existing organization or another active owner: non-zero exit; no writes and no new Cognito user.
- Existing active membership/profile for the requested subject: non-zero exit; no writes.
- Existing Cognito user without completed database bootstrap: non-zero exit unless the operator
  explicitly uses the recovery flag below.
- Unknown or incomplete configuration: exit code `2` before AWS clients are called.

## Partial-service failure recovery

Cognito and Aurora cannot share one transaction. The command preflights Aurora before creating a
new Cognito identity, but Aurora can still fail after Cognito succeeds because of connectivity,
migration, permission, or concurrent-state changes.

If the command reports that Cognito succeeded but Aurora failed:

1. Do not rerun without investigation and do not create another Cognito user.
2. Confirm the existing Cognito identity has the requested email and record its immutable `sub`
   through an approved administrative inspection.
3. Confirm Aurora contains no conflicting organization, owner, profile, or membership.
4. Correct the database/migration/permission issue.
5. Rerun the same command and add `--resume-existing-user`.

The recovery flag never creates a second Cognito user. It permits the command to link the
verified existing subject only after the normal database duplicate checks pass. If the bootstrap
is intentionally abandoned, user deletion is a separate owner-approved Cognito administrative
operation after confirming that no database records were created; this command does not delete
users or data.

## Logging and security boundaries

- Output never includes passwords, tokens, credentials, secret values, raw AWS errors, owner
  email, database rows, or ARNs.
- Inputs are not persisted by the command. Be mindful that shell history can retain command-line
  values; environment variables or an approved automation secret/configuration channel may be
  preferable for operational execution.
- The Aurora function is not granted to the Lambda runtime role.
- The database, API, and normal membership UI cannot invoke initial bootstrap.
- Every real invocation is visible through Cognito/AWS API activity and the application audit
  event `organization.initial_owner_bootstrapped`.
