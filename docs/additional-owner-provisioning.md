# Additional Owner Provisioning

## Purpose and boundary

Use this runbook only after the Perfect Shade organization has been created by the initial-owner
bootstrap. It creates one additional internal owner through a controlled operator command. It is
not an alternative initial bootstrap, a general membership tool, or an application endpoint.

The normal Team page and account API continue to accept only `admin` or `staff` for invitations
and role changes. They cannot create, promote, demote, disable, or remove an owner. The
additional-owner command has no role argument and always creates an active `owner` membership.

No step in this document authorizes an AWS deployment, database migration, or real user creation.
Those operations require their own approved production change.

## Required configuration

The operator needs an approved AWS profile whose normal credential chain permits the required
read/write operations. Do not pass access keys on the command line.

| Argument | Environment value | Purpose |
| --- | --- | --- |
| `--region` | `AWS_REGION` | Cognito and Aurora region |
| `--user-pool-id` | `COGNITO_USER_POOL_ID` | Staff-only pool containing the intended owner |
| `--cluster-arn` | `DATABASE_CLUSTER_ARN` | Aurora cluster |
| `--admin-secret-arn` | `DATABASE_ADMIN_SECRET_ARN` | `AuroraAdminSecretArn` stack output |
| `--database` | `DATABASE_NAME` | Aurora database name |
| `--organization-id` | `OWNER_ORGANIZATION_ID` | Existing Perfect Shade organization UUID |
| `--owner-email` | `ADDITIONAL_OWNER_EMAIL` | Approved internal owner email |
| `--authorized-by-subject` | `AUTHORIZING_OWNER_SUB` | Existing active owner's Cognito subject |
| `--authorization-reference` | `OWNER_AUTHORIZATION_REFERENCE` | Approved, non-sensitive change reference |
| `--profile` | `AWS_PROFILE` | Optional named profile selected through standard AWS resolution |

The authorization reference must not contain passwords, MFA codes, tokens, credentials, customer
data, or private identity-verification facts. The operator must verify the intended human and the
authorizing owner through an approved out-of-band process before execution.

The command requires the administrative/migration database secret. It ignores
`DATABASE_RUNTIME_SECRET_ARN`, rejects the standard `/aurora/runtime` secret path, and executes a
function explicitly revoked from `perfect_shade_app_runtime`.

## Command sequence

Use placeholders only in saved commands and change records:

```powershell
pnpm owner:add -- --dry-run `
  --region '<aws-region>' `
  --user-pool-id '<staff-user-pool-id>' `
  --cluster-arn '<aurora-cluster-arn>' `
  --admin-secret-arn '<AuroraAdminSecretArn-output>' `
  --database '<database-name>' `
  --organization-id '<existing-organization-uuid>' `
  --owner-email '<approved-additional-owner-email>' `
  --authorized-by-subject '<existing-active-owner-cognito-sub>' `
  --authorization-reference '<approved-change-reference>' `
  --profile '<approved-aws-profile>'
```

Repeat the reviewed arguments with `--preflight`. Preflight uses `AdminGetUser` and a non-mutating
Aurora transaction to verify:

- the organization exists;
- it already has an active owner;
- the authorizing subject is an active owner of that exact organization;
- the target subject/email is not linked to another organization;
- no conflicting profile or membership exists.

If the intended Cognito identity already exists, inspect its enabled status, verified email,
subject, and pool before rerunning preflight with `--resume-existing-user`. The flag is explicit
acknowledgement that the operator has performed that review. It does not bypass database checks.

After the preflight and authorization record are reviewed, repeat the identical arguments with
`--execute`. If the identity is absent, the command calls `AdminCreateUser` with email delivery.
Cognito generates the temporary credentials and delivers them; the command accepts and prints no
password. The owner must complete `NEW_PASSWORD_REQUIRED` and production TOTP setup at first login.

## Database and audit behavior

Migration `0009_additional_owner_provisioning.sql` installs
`app_private.provision_additional_owner`. The function:

- serializes attempts for the organization/email;
- resolves the organization and authorizing membership from Aurora;
- accepts no role and hard-codes `owner` plus `active`;
- creates the profile, membership, and
  `organization.additional_owner_provisioned` audit event in one transaction;
- returns `already_complete` without another write or audit event for a completed duplicate;
- rejects missing organizations, missing active ownership, invalid authorizers, identity
  conflicts, and cross-organization linkage;
- grants no execution access to the application runtime role.

The Data API adapter explicitly begins, commits, or rolls back the transaction. Audit events remain
protected by the existing append-only trigger.

## Partial external-service recovery

If Cognito succeeds and Aurora fails, do not create another user and do not call `AdminDeleteUser`
as automatic cleanup. Record the secret-safe failure, correct the migration/configuration/data
issue, verify the Cognito identity with `AdminGetUser`, and rerun the identical command with
`--resume-existing-user --preflight`. Execute only after that preflight returns ready.

If an `AdminCreateUser` response is uncertain, inspect Cognito first. Treat the identity as
potentially created until `AdminGetUser` proves otherwise. Never expose temporary credentials while
investigating.

Completed duplicate execution is safe: it returns `already_complete`, creates no replacement user,
and adds no second audit event. Conflicting subject, email, membership, tenant, or authorization
state fails without database mutation.

## Production ownership sequence

1. Bootstrap Sheri as the initial Perfect Shade owner using `pnpm bootstrap:owner`.
2. Sheri completes the first-login permanent-password challenge and TOTP MFA enrollment.
3. An approved operator runs this controlled workflow for Seth / Unified Techworks, with Sheri's
   active Cognito subject as the authorizing owner and a reviewed change reference.
4. Seth completes the first-login permanent-password challenge and TOTP MFA enrollment.
5. Verify both identities return the Perfect Shade organization and `owner` role from the account
   API, and verify protected access independently.
6. Confirm the Team UI cannot demote, disable, remove, or replace either owner.
7. Provision all future non-owner personnel through Team management as `admin` or `staff` only.

Use two separately authenticated browser sessions for the final owner checks. Do not share
passwords, sessions, MFA seeds, or tokens between the owners or record them in the change record.

## Required operator permissions and prerequisites

Before a live run, confirm:

- migration `0009` is applied through the approved migration runner;
- the staff User Pool is the intended environment's administrator-created-only pool;
- the organization's initial owner is active and has authorized the change;
- production SES/Cognito invitation delivery is healthy;
- the operator profile is approved for `cognito-idp:AdminGetUser`,
  `cognito-idp:AdminCreateUser`, the required RDS Data API transaction calls, and read access to
  the administrative secret;
- the operator does not expose `DATABASE_ADMIN_SECRET_ARN` to either application Lambda;
- rollback/recovery ownership and the first-login support window are scheduled.

The command does not deploy infrastructure, apply migrations, manage MFA, change an existing
membership, or delete a Cognito identity.
