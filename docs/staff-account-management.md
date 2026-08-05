# Internal Staff Account Management

This phase adds protected administration for Perfect Shade's internal `owner`, `admin`, and
`staff` memberships. It does not add public signup, customer accounts, organization switching,
or hard user deletion.

## Protected application routes

- `/app/account` displays Cognito identity state, the active Aurora organization and role, and
  allows the signed-in user to edit their own display name.
- `/app/account/team` lists organization memberships and is available only to active owners and
  admins. Staff requests fail closed at both the page and API boundaries.

The team list shows the database membership role/status and, when Cognito is available, the
account status, enabled flag, invitation-pending state, and Cognito state timestamps. Cognito
directory failure does not fabricate account state; the page labels that status unavailable.

## API operations

Every route requires the existing API Gateway Cognito JWT authorizer. Lambda obtains the actor
from the validated `sub`; request bodies never supply the actor, organization, or current role.

| Method and route | Purpose |
| --- | --- |
| `GET /v1/account/team` | List the actor's organization team |
| `POST /v1/account/team/invitations` | Provision an internal admin or staff user |
| `POST /v1/account/team/{membershipId}/role` | Change staff/admin role |
| `POST /v1/account/team/{membershipId}/disable` | Disable a membership |
| `POST /v1/account/team/{membershipId}/enable` | Re-enable a disabled membership |
| `POST /v1/account/team/{membershipId}/remove` | Soft-remove a membership |
| `POST /v1/account/profile` | Update the actor's display name |

The CDK account Lambda has only `AdminGetUser`, `AdminCreateUser`, and `ListUsers` for the named
staff User Pool. It has no Cognito delete permission. Public self-signup remains disabled.

## Permission rules

- Owner may invite admins or staff, change staff/admin roles, and manage non-owner membership
  state.
- Admin may invite and manage staff only. Admin cannot create or manage owners or other admins.
- Staff cannot list or mutate team memberships.
- No actor may mutate their own membership through these commands.
- Owner membership cannot be promoted, demoted, disabled, or removed through the general staff
  workflow. The migration also checks the last-active-owner invariant.
- Target membership lookup is constrained to the server-resolved organization. A target in
  another organization is reported only as not found.

Migration `0004_staff_account_management.sql` installs task-specific security-definer commands,
RLS policies, normalized-email uniqueness, soft-state transitions, and append-only audit event
creation. The runtime role receives command execution only; direct profile/membership writes and
all deletes remain revoked.

## Invitation and temporary-password behavior

Invitation input accepts only an email and target role `admin` or `staff`. `owner` is never an
accepted target.

The account Lambda:

1. Resolves the actor's active Aurora organization and role.
2. Checks the organization for a duplicate staff email before any Cognito mutation.
3. Calls `AdminGetUser` to detect an existing Cognito identity.
4. Calls `AdminCreateUser` only when no identity exists and requests email delivery.
5. Never accepts, receives, returns, or logs a temporary password. Cognito generates it.
6. Creates the profile, membership, and `membership.invited` audit event in one Aurora
   transaction.

The invitee completes the existing Cognito `NEW_PASSWORD_REQUIRED` flow at first sign-in.

## Partial-service failure recovery

Cognito and Aurora cannot share a transaction. Database changes roll back together, but Cognito
creation cannot be rolled back automatically. If the API returns
`cognito_created_database_failed`:

1. Do not submit a normal invitation again and do not create, delete, or recreate a Cognito user.
2. Use an approved administrative inspection to verify the existing Cognito email, verified
   state, enabled state, and immutable `sub` without viewing credentials.
3. Verify Aurora has no conflicting profile or membership and identify the migration,
   permission, connectivity, or constraint failure.
4. Correct the database or deployment problem.
5. Retry the same email and role once with `resumeExistingUser: true`, or select the clearly
   labeled recovery checkbox in `/app/account/team`.

Recovery refuses a missing, disabled, unverified, differently addressed, or conflicting
Cognito identity. If a prior database commit succeeded but its response was lost, the recovery
command returns the existing matching membership without duplicating data or audit events.

## Membership states and audit events

`active`, `disabled`, and `removed` are Aurora membership states. Disabled and removed users fail
the active-membership check even if their Cognito identity can still authenticate. Removal is
soft and does not delete the Cognito user. Re-enabling is allowed only from `disabled`; a removed
membership is terminal in this workflow.

Successful changes write append-only events:

- `membership.invited`
- `membership.role_changed`
- `membership.disabled`
- `membership.enabled`
- `membership.removed`
- `profile.display_name_updated`

Audit metadata contains roles/states and the recovery flag, never passwords, tokens, temporary
credentials, raw AWS errors, or authorization headers.

## Deployment coordination

This source task does not apply migrations or deploy AWS. Integration requires a separately
authorized development rollout:

1. Confirm migration status and recovery readiness.
2. Apply `0004_staff_account_management.sql` with the controlled migration identity.
3. Deploy the CDK account Lambda routes, `COGNITO_USER_POOL_ID`, and least-privilege Cognito IAM
   additions.
4. Deploy the web application.
5. Validate owner/admin/staff permissions with approved nonproduction identities.

Do not expose the team UI before both the migration and API routes are available.
