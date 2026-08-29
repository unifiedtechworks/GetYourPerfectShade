# Account Architecture

The authoritative backend decision is [`aws-backend-architecture.md`](./aws-backend-architecture.md).
This document describes the application-side Cognito implementation.

## Account and identity model

Perfect Shade uses internal staff accounts only. Amazon Cognito User Pools authenticates staff;
public self-registration and customer-facing login are excluded. Administrators provision users,
and an administrator-created user completes Cognito's `NEW_PASSWORD_REQUIRED` challenge before
receiving an application session. Production additionally requires Cognito-managed TOTP MFA for
every staff role.

Cognito `sub` is the immutable actor identity. Cognito groups are not application roles. The AWS
account API resolves the actor's active database membership and returns one of:

- `owner`: full organization and membership control.
- `admin`: staff and business-record management, but no owner removal, demotion, replacement, or
  ownership transfer.
- `staff`: operational business-record access without membership administration or
  organization-level destructive actions.

The API and Aurora policies—not UI values or Cognito groups—must prevent privilege escalation.
Customer-facing identities remain intentionally excluded.

## Session design

Server actions call Cognito using the AWS SDK's public User Pool operations. Access, ID, and
refresh tokens are stored in `Secure` (production), `HttpOnly`, `SameSite=Lax` cookies and are
never stored in browser local storage. `proxy.ts` validates or server-refreshes the session before
protected navigation. Every protected server layout independently validates the access and ID
tokens again.

Validation checks the Cognito issuer, JWKS signature, expiry, token use, app client ID/audience,
and matching `sub`. The access token is sent as a bearer token to the AWS API. No AWS credentials,
client secret, database secret, or account ID is exposed to the browser.

Current custom flows:

- Email/password sign-in using `USER_PASSWORD_AUTH`.
- Administrator-created user's `NEW_PASSWORD_REQUIRED` response.
- TOTP enrollment through `MFA_SETUP`, `AssociateSoftwareToken`, and `VerifySoftwareToken`.
- Subsequent authenticator-code sign-in through `SOFTWARE_TOKEN_MFA`.
- Generic forgot-password response using `ForgotPassword`.
- Recovery-code confirmation using `ConfirmForgotPassword`.
- Cognito global sign-out where available plus unconditional local cookie removal.

Challenge state is type-scoped and expires after ten minutes. MFA setup keys are shown only in
the current enrollment view and are never logged or persisted by Perfect Shade. Other Cognito
challenges fail closed with a generic message.

## Route boundaries

| Area | Routes | Behavior |
| --- | --- | --- |
| Marketing | Existing public routes | Unchanged and public |
| Authentication | `/sign-in`, `/forgot-password`, `/reset-password`, `/auth/new-password`, `/auth/mfa/setup`, `/auth/mfa/verify` | Public flow endpoints; no `/sign-up` route |
| Application | `/app/*` | Cognito session required by proxy and server layout |

`safeNextPath` rejects external and scheme-relative redirect targets. Missing Cognito
configuration fails closed for `/app/*` while public routes continue to build and render.

## Account API contract

`GET {NEXT_PUBLIC_API_BASE_URL}/v1/account` receives the Cognito access token as
`Authorization: Bearer <token>`. A successful response is:

```json
{
  "organizationId": "organization-uuid",
  "organizationName": "Perfect Shade",
  "role": "owner",
  "profile": {
    "displayName": "Staff display name",
    "email": "staff@example.invalid"
  }
}
```

Only `owner`, `admin`, and `staff` are accepted. A missing API configuration or unavailable API
does not fabricate membership: authenticated screens show an explicit unavailable state and
organization-required estimate routes remain inaccessible.

## Internal staff administration

Active owners and admins use `/app/account/team`; staff cannot access membership operations.
The account Lambda derives actor, organization, and current role from the validated Cognito
`sub` and Aurora membership. It uses Cognito administrator APIs only inside the trusted Lambda,
while Aurora migration `0004_staff_account_management.sql` enforces task-specific membership
commands, soft status changes, owner/self protections, tenant predicates, and audit events.

General provisioning accepts only `admin` and `staff`; owner creation remains exclusive to the
initial owner bootstrap. Cognito generates and emails temporary passwords, which are never
accepted or returned by the application. See
[`staff-account-management.md`](./staff-account-management.md) for API contracts, permissions,
and partial-service recovery.

Production environment isolation, TOTP behavior, SES requirements, and the controlled Cognito
subject-relink runbook are documented in
[`production-identity-readiness.md`](./production-identity-readiness.md).

## Provider transition status

Cognito and the AWS account API are the only active account providers. The former Supabase
callback, middleware, server client, packages, environment variables, and migrations are removed.
Their design history remains in Git, while the deployable account schema now begins at
`infra/database/migrations/0001_account_foundation.sql`.
