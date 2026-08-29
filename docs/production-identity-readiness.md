# Production Identity Readiness

## Scope

This repository contains the separate production staff identity and infrastructure definitions
without authorizing or creating live resources. AWS provisioning, SES verification, DNS,
migrations, user creation, and deployment remain separate approved operations owned by Chat 5.
Development remains compatible with its current pool and may keep MFA off.

Perfect Shade has no public signup or customer identity flow. Production users are internal
`owner`, `admin`, or `staff` members provisioned with Cognito administrator APIs in the trusted
account Lambda. The browser never receives Cognito administrator permissions.

## Environment isolation contract

Each deployed web environment must set its own complete, non-secret values:

```dotenv
NEXT_PUBLIC_PERFECT_SHADE_ENVIRONMENT=production
NEXT_PUBLIC_AWS_REGION=us-west-2
NEXT_PUBLIC_COGNITO_USER_POOL_ID=<production-user-pool-id>
NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID=<production-public-client-id>
NEXT_PUBLIC_API_BASE_URL=https://<production-api-id>.execute-api.us-west-2.amazonaws.com
NEXT_PUBLIC_SITE_URL=https://www.getyourperfectshade.com
```

Production configuration fails closed when the API or site URL is absent, malformed, non-HTTPS,
or local. The pool ID must belong to the configured region. Development defaults to
`NEXT_PUBLIC_PERFECT_SHADE_ENVIRONMENT=development` for backward compatibility, may use
`http://localhost:3000`, and may omit the API while backend work is unavailable.

The production pool/client, API, Aurora data, and Amplify branch values must be distinct from
development. Copying users, tokens, sessions, refresh tokens, or Cognito subjects between pools
is prohibited. The production client is a public client without a secret.

The identity construct accepts a production-only contract that requires:

- pool-wide TOTP MFA (`required`) with SMS MFA disabled;
- administrator-only provisioning and email-only recovery;
- deletion protection and retained removal policy;
- SES delivery configuration;
- exactly one approved callback, logout, and CORS origin;
- `https://www.getyourperfectshade.com/auth/callback` and
  `https://www.getyourperfectshade.com/sign-in` on the canonical site.

The application currently uses custom server-action authentication, not Hosted UI sign-in. The
reserved callback route therefore discards unsolicited authorization parameters and returns the
user to a generic sign-in error. It must not exchange or display an unexpected code. Logout is
the canonical sign-in route; application sign-out still attempts Cognito global sign-out and
always clears local cookies.

The integrated `PerfectShadeProduction` stack consumes this identity contract exactly once; it
does not reuse the development pool. This task does not deploy that stack.

## Staff MFA behavior

Production Cognito enforces TOTP for every staff identity, regardless of Aurora role. On first
sign-in Cognito may sequence `NEW_PASSWORD_REQUIRED`, then `MFA_SETUP`. The application:

1. stores only Cognito's opaque, short-lived challenge session in a Secure/HttpOnly/SameSite
   challenge cookie;
2. calls `AssociateSoftwareToken` and shows the setup key only in the current setup view;
3. never logs, writes to Aurora, writes to browser storage, or puts the key in a URL;
4. calls `VerifySoftwareToken` with the six-digit code;
5. completes `MFA_SETUP`, then creates the normal protected session;
6. handles later `SOFTWARE_TOKEN_MFA` challenges with a six-digit verification page.

Challenge cookies expire after ten minutes and encode an issued-at time. Missing, malformed,
future-dated, expired, or wrong-kind challenge state fails closed and requires sign-in to restart.
Invalid codes retain a generic retry state. Any unimplemented Cognito challenge fails closed;
passwords, MFA codes, setup keys, tokens, and raw Cognito errors are never logged.

Cognito owns the TOTP seed. It cannot be recovered from the application. A lost authenticator is
an administrator-assisted Cognito recovery event; never attempt to reconstruct or store its seed.

## Production account recovery

Cognito password recovery uses verified email through `ForgotPassword` and
`ConfirmForgotPassword`. The start response remains generic to prevent account enumeration.
Production recovery mail therefore depends on the SES contract below. Recovery must not add a
public signup route or permit an unapproved user to become a member.

If an identity or pool is accidentally removed, Cognito passwords, sessions, and MFA seeds do
not survive. The replacement identity must be administrator-provisioned, complete a new password,
and enroll TOTP again. Existing Aurora organization, role, status, and audit history are preserved
through the controlled CLI and migration `0008_identity_recovery.sql`.

### Authorization and identity proof

Before running the CLI, two people should review the incident/recovery record when practical.
An active owner must explicitly authorize it. Verify the intended human through the approved
business contact method and at least one previously recorded non-secret fact; do not rely only on
an email received during the incident. Record a non-sensitive ticket/change reference. Never put
passwords, MFA codes, access tokens, private contact facts, or credentials in the reference.

The operator must establish all of the following:

- exact affected environment and User Pool;
- exact organization UUID;
- active authorizing owner's existing Aurora/Cognito subject;
- target member's stored email and old subject;
- administrator-created replacement's verified email and new subject;
- explicit old-subject to new-subject transition;
- approved authorization reference.

The CLI verifies the replacement with read-only `AdminGetUser`. Aurora then verifies that the
authorizer is an active owner in the specified organization, the old subject belongs to that
organization, the stored email matches, and the new subject is unused. It cannot accept a role,
change role/status, cross organizations, create/delete Cognito users, or run through the web/API
runtime role. The relink and `identity.relinked` audit event commit in one database transaction.

### Command

Use normal AWS credential resolution. `--profile` sets `AWS_PROFILE`; no access key is accepted by
the command. Populate shell variables or pass placeholders interactively without committing them:

```powershell
pnpm recover:identity -- --dry-run `
  --region us-west-2 `
  --user-pool-id '<production-user-pool-id>' `
  --cluster-arn '<production-aurora-cluster-arn>' `
  --admin-secret-arn '<AuroraAdminSecretArn-output>' `
  --database '<database-name>' `
  --organization-id '<organization-uuid>' `
  --staff-email '<approved-staff-email>' `
  --old-subject '<old-cognito-sub>' `
  --new-subject '<new-cognito-sub>' `
  --authorized-by-subject '<active-owner-sub>' `
  --authorization-reference '<approved-change-reference>' `
  --profile '<approved-aws-profile>'
```

Run the same reviewed arguments with `--preflight`. This performs read-only Cognito verification
and an Aurora transaction that returns `ready` without changing data. Recheck the environment,
subjects, email, organization, change record, and command output. Only after explicit approval,
run the identical command with `--execute`.

Safe duplicate behavior is `already_complete`; no second audit event or data change occurs. Any
authorization, tenant, email, or subject conflict stops without mutation. Data API failures roll
back. If command output is lost, rerun `--preflight`: `already_complete` is the safe result. Do not
edit Aurora rows directly, rerun owner bootstrap, disable the existing owner, or call
`AdminDeleteUser` as recovery cleanup.

Identity recovery and migration `0008` require the retained Aurora admin/migration credential.
Set `DATABASE_ADMIN_SECRET_ARN` from the production `AuroraAdminSecretArn` output or pass
`--admin-secret-arn`. The CLI rejects the named production runtime-secret path, and Aurora
withholds the recovery function from `perfect_shade_app_runtime`. Normal account and estimate
Lambdas continue receiving only `DATABASE_RUNTIME_SECRET_ARN`, populated from the
`AuroraRuntimeSecretArn` output; never substitute the admin secret into application configuration.

For whole-pool recreation, provision replacement staff identities administratively first, then
relink one approved member at a time. Preserve the old pool and database recovery point until all
acceptance checks pass. The authorizing owner subject refers to the still-recorded active owner in
Aurora; ownership is checked from database state, not caller-provided role text.

## SES application contract

Chat 5 owns deployment and verification of the production stack's SES/Cognito wiring. The
application/identity construct expects:

- an owned sending domain verified in `us-west-2`;
- Easy DKIM records published and verification complete;
- an approved sender address on that exact verified domain, preferably a role address;
- SES production access before real invitations or recovery messages;
- aligned MAIL FROM/SPF and monitored DMARC rollout;
- a monitored reply-to/operations path;
- bounce and complaint notifications, suppression-list handling, alert thresholds, and an owned
  procedure that stops invitations/recovery when delivery reputation is unhealthy.

The production identity config requires `emailSenderMode=ses`, `sesVerifiedDomain`, and
`sesFromEmail`, and rejects a sender outside the verified domain. Cognito uses this sender for
administrator invitations, verification, and password recovery. Estimate/bid delivery is a
separate transactional mail path and must not reuse Cognito's delivery integration by accident.

No SES SMTP password, AWS key, DKIM private material, message token, or recipient list belongs in
browser variables, source, logs, screenshots, or documentation examples.

## Production account/team acceptance checklist

- [ ] Production pool/client and API are separate from development; environment values point only
  to the production set and use the canonical HTTPS site.
- [ ] Pool self-signup is disabled and `/sign-up` returns not found.
- [ ] Owner, admin, and staff invitations are administrator-created; the general invite workflow
  accepts only admin/staff and never owner.
- [ ] Every production role completes TOTP enrollment and subsequent MFA sign-in; SMS is not
  enabled and unsupported challenges fail closed.
- [ ] Challenge expiry, invalid code, lost authenticator, password recovery, sign-out/global
  sign-out, refresh, and invalid-session behavior pass without secret exposure.
- [ ] Protected `/app/*` routes fail closed before and after sign-out.
- [ ] Owner protections, last-owner invariant, self-escalation denial, admin/staff matrix, and
  cross-organization denial pass with approved test identities.
- [ ] Disable/re-enable and soft removal behave as documented; no normal `AdminDeleteUser` path
  exists.
- [ ] Invitation partial-failure recovery and duplicate invitation behavior pass without exposing
  Cognito temporary passwords.
- [ ] Audit events remain append-only and cover invitation, role/state changes, profile changes,
  and controlled identity recovery.
- [ ] SES domain/DKIM/production access, sender, bounce/complaint monitoring, and password-recovery
  delivery are verified.
- [ ] Identity recreation/relink preflight and a nonproduction recovery drill pass; role, status,
  organization, audit history, and tenant boundary are preserved.
- [ ] No development identity/session works against production, and no production identity/session
  works against development.
- [ ] Mocked account/team suites, full tests, type validation, production build, whitespace check,
  and credential scan pass on the exact release commit.

Do not perform the live checklist using the only production owner. Use separately approved test
identities and retain one valid owner throughout acceptance.
