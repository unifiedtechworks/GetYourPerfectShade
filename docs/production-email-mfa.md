# Production Email MFA and Staff Recovery

## Current launch decisions and remaining operational gap

The owner-approved 2026-10-17 plan makes Sheri the **sole Perfect Shade application Owner**.
After activation, Sheri invites Seth as an **Admin** through existing Team Management; no viewer
role or second Owner is needed. `UTAdmin` is Seth's separate AWS Identity Center identity, not his
Perfect Shade application user. Do not provision AWS permissions for website administration.

Use an existing authorized, suitably MFA-backed AWS administrative session for routine Cognito
resets where available. Its exact permissions/authentication must be verified, not inferred from
an application's Admin role or from the broad `default` IAM keys. The optional six-operation
Identity Center recovery permission set is useful least privilege, not a mandatory new deployment.
The owner accepts existing protected root access solely to restore AWS administration in an
exceptional lockout. No dedicated emergency IAM identity/role or second human is required.
The [recovery access guard](./identity-center-recovery-access.md) supports this explicitly without
fabricated backup IDs or emergency-IAM test evidence. Context-aware Identity Center MFA remains.

`pnpm recover:account` is still **preflight only**, uses only its explicitly approved SSO profile,
and rejects default/root/ordinary IAM fallback. It cannot reset a password or replace an email.
Before enabling production email MFA, the smallest tooling gap is a reviewed local SDK executor
or equivalently reviewed existing-admin procedure: explicit temporary caller/account/pool checks,
immutable subject and authorization checks, cryptographic in-memory/non-echoing password handling,
`AdminSetUserPassword(Permanent=false)`, secure one-time handoff, and redacted incident/CloudTrail
audit. An existing-admin adapter must allow only the separately reviewed caller, never arbitrary
credential fallback. No website recovery API or new AWS service is needed. The owner must select
the private delivery method; this repository must not generate, print, or store a password meanwhile.
AWS does not deliver a password set by AdminSetUserPassword: the operator must arrange that handoff.

All recovery keeps the same Cognito user/sub, organization membership, role, and prior audit history.
For a lost mailbox, prove control of an actually enrolled TOTP before choosing it; otherwise prove
the replacement mailbox independently, repeat collision checks, and authorize the minimum email
change. Never transfer an alias, create a replacement user, disable required pool MFA, or manually
edit Aurora. Any stale `email_snapshot` needs the separately approved tenant-scoped audited
reconciliation workflow. Its executor remains a real prerequisite for claiming complete lost-mailbox
application recovery, even if the Cognito-only test succeeds.

Production email MFA is not claimed enabled by this source checkpoint. No user, pool, database,
Amplify, SES, or DNS mutation is authorized here. The old dedicated emergency-IAM and disposable
pool drill designs remain inactive optional future plans, not requirements to add infrastructure.

## Scope and approved design

Perfect Shade production uses Cognito-native email MFA as an additional option for internal staff.
It is still password-first multi-factor authentication, not passwordless email sign-in:

- the application starts only `USER_PASSWORD_AUTH`;
- the production pool keeps `MfaConfiguration=ON`;
- `EMAIL_OTP` and `SOFTWARE_TOKEN_MFA` are enabled second factors;
- SMS MFA and public signup remain disabled;
- the public app client remains secretless;
- Cognito and the existing SES configuration send and validate codes; and
- no code, token, MFA setup key, or Cognito session is logged or stored in Aurora, a URL,
  analytics, or browser storage.

AWS currently names native email MFA `EMAIL_OTP` in the API and CloudFormation. The application
also accepts the documented legacy `EMAIL_MFA` challenge response, using `EMAIL_MFA_CODE`, but it
never initiates `USER_AUTH` or advertises email OTP as a first factor. Unsupported challenges fail
closed.

## Production Cognito contract

The production User Pool must retain all of these settings:

| Setting | Required value |
| --- | --- |
| Feature plan | `ESSENTIALS` |
| MFA enforcement | `ON` / required |
| Enabled MFA factors | `EMAIL_OTP`, `SOFTWARE_TOKEN_MFA` |
| SMS MFA | Disabled |
| Account recovery | `admin_only` |
| Email delivery | Existing SES domain identity, sender, Reply-To, configuration set, and feedback integration |
| User creation | Administrator only |
| Deletion protection/removal | Active / retain |
| App client | Existing public client, no client secret, password-first flows retained |

Email MFA requires Essentials or Plus and SES developer-mode delivery. Essentials is sufficient;
Plus is not justified by this change. The production pool was already observed on Essentials, so
enabling email MFA does not itself require a tier upgrade. AWS currently prices Essentials by
monthly active user, with a 10,000-direct/social-MAU monthly free tier and a published rate of
$0.015 per additional MAU, plus SES message charges. Pricing can change; review the current
[Cognito pricing](https://aws.amazon.com/cognito/pricing/) and
[SES pricing](https://aws.amazon.com/ses/pricing/) before approval.

## Sign-in and first-login flows

For Sheri's initial production sign-in:

1. An approved operator provisions the owner with the existing controlled bootstrap command.
2. Cognito sends the invitation and temporary password; no application log or operator record
   stores it.
3. Sheri enters her staff email and temporary password at `/sign-in`.
4. The application completes `NEW_PASSWORD_REQUIRED` and Sheri chooses a permanent password.
5. When Cognito returns email MFA directly, the application stores only the opaque challenge in a
   Secure, HttpOnly, SameSite=Lax cookie and opens `/auth/mfa/email`.
6. If Cognito returns `SELECT_MFA_TYPE`, Sheri chooses **Email verification code**. The server
   responds with `ANSWER=EMAIL_OTP`; Cognito sends the code through the existing SES configuration.
7. Sheri enters the six-digit code. The server responds to Cognito's `EMAIL_OTP` challenge with
   `EMAIL_OTP_CODE`.
8. Only Cognito success with complete tokens creates application session cookies.

An incorrect or expired code produces a secret-safe retry message. A missing, malformed,
future-dated, or more-than-ten-minute-old challenge fails closed. Cognito does not provide a
separate resend operation for this password-first challenge; **Restart sign in** safely begins a
new password-first authentication and requests a new code.

TOTP remains available. A staff member can choose **Authenticator application** when Cognito
returns `SELECT_MFA_TYPE`; an enrolled user receives `SOFTWARE_TOKEN_MFA`, and an unenrolled user
can receive `MFA_SETUP`, followed by `AssociateSoftwareToken` and `VerifySoftwareToken`. Perfect
Shade never persists the TOTP seed.

The method selection applies to the current Cognito challenge. For a persistent preference, an
authorized administrator can use `AdminSetUserMFAPreference`, or a future authenticated account
setting can use `SetUserMFAPreference` for the current access-token subject. Only one factor can be
preferred. Do not change another user's preference without explicit authorization, and never
expose an administrator preference API through the public application.

These states are not interchangeable:

- **Enrollment** means Cognito has an associated and verified factor for the user. TOTP enrollment
  requires `AssociateSoftwareToken` followed by `VerifySoftwareToken`.
- **Enabled factor** means Cognito can challenge that user with the enrolled or eligible method.
- **Preference** selects among enabled factors; it does not create a TOTP enrollment, replace an
  authenticator, or prove that a TOTP is usable.
- **Eligible email** is a verified email attribute that Cognito can use for native email MFA.

[`AdminSetUserMFAPreference`](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminSetUserMFAPreference.html)
does not reset or enroll TOTP. Recovery decisions must use the user's actual Cognito attributes,
`UserMFASettingList`, preferred setting, and a successful factor challenge—not an inferred state.

## Administrator-assisted password and MFA recovery

Email cannot be both the user's MFA destination and self-service password-recovery destination.
Production therefore uses `AccountRecovery.NONE`, which synthesizes as the sole `admin_only`
mechanism. `/forgot-password` and `/reset-password` explain the support process in production and
do not call `ForgotPassword` or `ConfirmForgotPassword`. Development retains verified-email
self-service recovery.

Every recovery begins with the same authorization gate:

1. The affected staff member contacts an active owner and an approved AWS recovery operator through
   the approved support channel. An application `owner` role does not grant AWS access.
2. Two people review lost-mailbox recovery when practical. Verify the intended human using a
   separate approved contact path and previously recorded non-secret facts; never trust only the
   affected or replacement mailbox.
3. Record the active-owner approval, recovery scenario, exact pool and immutable Cognito subject,
   and a non-sensitive incident/change reference. Keep passwords, codes, tokens, mailbox proof,
   AWS credentials, and private identity facts out of that record.
4. The operator uses an explicitly authorized MFA-backed AWS administrative temporary session (or
   the optional scoped recovery permission set when separately activated) and uses
   `AdminGetUser` to record only the safe state needed for the decision: enabled/status,
   `email_verified`, immutable `sub`, `UserMFASettingList`, and preferred MFA setting. Confirm the
   Aurora membership and role read-only. Stop on any identity, subject, tenant, or authorization
   mismatch.

### Scenario A: password forgotten, MFA email accessible

1. Generate a high-entropy temporary password with an approved secret tool.
2. Call `AdminSetUserPassword` for the verified subject with `Permanent=false`. Use an approved
   operator wrapper that accepts the password through a non-echoing prompt; do not place it in a
   command argument, environment variable, source file, chat, ticket, log, screenshot, or reusable
   shell history.
3. Transfer the temporary password once through an approved secure channel. The user signs in with
   the current email, completes `NEW_PASSWORD_REQUIRED`, and then completes the normal required
   email or TOTP challenge.
4. Globally sign the user out when the incident requires revocation, then confirm a fresh
   password-plus-MFA sign-in and protected account access.

AWS documents that a non-permanent password moves the user to `FORCE_CHANGE_PASSWORD` and produces
`NEW_PASSWORD_REQUIRED` on the next sign-in. `AdminResetUserPassword` is not appropriate here: it
depends on self-service recovery delivery, while production deliberately uses `admin_only`.

### Scenario B: MFA email unavailable, existing TOTP usable

1. Confirm `AdminGetUser` reports `SOFTWARE_TOKEN_MFA` in the user's enrolled settings and have the
   user demonstrate that the existing authenticator still produces a successful Cognito challenge.
2. If email is preferred and Cognito will not offer the enrolled TOTP, separately authorize the
   smallest per-user `AdminSetUserMFAPreference` change needed to prefer the already enrolled TOTP.
   Do not clear every factor and do not change pool-wide MFA.
3. Complete any separately authorized password reset, then confirm password plus the existing TOTP,
   protected account access, global sign-out, and a second fresh sign-in.

Setting the TOTP preference is permitted only after enrollment is independently established. A
preference update is never evidence of enrollment and must never be described as forcing setup.

### Scenario C: MFA email unavailable, no usable TOTP

Do not disable email MFA and hope Cognito enrolls TOTP. Preserve the existing Cognito user and
immutable `sub`; do not create a replacement identity or relink Aurora.

1. Complete the common authorization gate and obtain explicit approval to replace the user's email
   sign-in/MFA attribute. Independently prove that the intended human controls the proposed mailbox.
2. Use `ListUsers` with an exact email filter and reviewed `AdminGetUser` checks to detect collisions.
   Stop if the address is already assigned or Cognito returns `AliasExistsException` or another
   uniqueness conflict. Never force an alias transfer.
3. The production pool uses `UsernameAttributes=[email]`, not a separate email alias. AWS documents
   that a unique updated email becomes the new username for an email-username pool while the
   internal username/`sub` remains unchanged. After recovery, the old email must no longer be used
   for sign-in and the replacement email must be tested.
4. The deployed pool currently does not keep the old email active while an update is awaiting
   verification. An unverified update can therefore leave both old and new addresses unusable.
   Before `AdminUpdateUserAttributes`, complete the approved out-of-band mailbox-ownership
   verification. Only then may the operator submit the new `email` and `email_verified=true` in the
   same authorized change. AWS does not send a Cognito verification message when an administrator
   marks the attribute verified; the evidence and approval are therefore mandatory. If that proof
   is unavailable, stop rather than marking the address verified.
5. Use `AdminGetUser` by immutable subject after the update. Confirm the same `sub`, new normalized
   email, verified state, unchanged enabled status, and expected MFA settings. Do not assume email
   MFA preference or enrollment was removed; let Cognito return the next real challenge.
6. Complete any authorized temporary-password flow, then verify sign-in with the replacement email,
   native email MFA delivery to that mailbox, protected account access, global sign-out, and a
   second fresh sign-in. Review CloudTrail and close the change only after every check passes.

`app.profiles.email_snapshot` is a separate application record. Cognito email replacement does not
update it. The subject-based membership and owner role remain valid, but account/team screens can
show the old address and duplicate-invitation checks can be inconsistent. Do not edit Aurora rows
directly or silently. Keep the incident open and use a separately reviewed, organization-scoped,
audited reconciliation operation when one is implemented; no such database mutation is authorized
by this runbook.

AWS behavior references: [username versus alias attributes](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-attributes.html),
[verification behavior for updated attributes](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-email-phone-verification.html),
and [`AdminUpdateUserAttributes`](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminUpdateUserAttributes.html).

## Recovery operator IAM boundary

The optional least-privilege implementation is the separate access-only Identity Center permission
set and SSO-only preflight tooling in [identity-center-recovery-access.md](./identity-center-recovery-access.md).
Existing authorized MFA-backed AWS administration may instead be reviewed for routine resets;
no new AWS permissions are required for website administration. The owner selected existing
protected root only as the exceptional AWS administrative fallback, not protected emergency IAM
access or another human. The old independent IAM definition remains inactive in
[protected-emergency-aws-access.md](./protected-emergency-aws-access.md). Nothing is activated here.
Keep `recoveryOperatorPrincipalArn` unset for that direct-assignment design. The older optional IAM
role below remains an alternative for a separately reviewed IAM-user trust model, not a federation
MFA shortcut. No access configuration or live recovery is authorized by this source checkpoint.

Read-only inventory on 2026-10-10 found no dedicated Perfect Shade recovery role or customer-managed
recovery policy. The production account Lambda has only `AdminCreateUser`, `AdminGetUser`, and
`ListUsers`; it cannot reset passwords, replace emails, change MFA preferences, or globally sign a
user out. The inspected human IAM user has broad `IAMFullAccess` and `PowerUserAccess`, so it is not
an acceptable least-privilege recovery identity.

The repository includes an opt-in CDK design named
`perfect-shade-production-cognito-recovery`. It is absent unless the exact
`recoveryOperatorPrincipalArn` context is supplied. Its policy is restricted to the one production
User Pool and only:

- `cognito-idp:AdminGetUser` and `cognito-idp:ListUsers` for identity/enrollment/collision checks;
- `cognito-idp:AdminSetUserPassword` for Scenario A;
- `cognito-idp:AdminUpdateUserAttributes` for the separately approved Scenario C;
- `cognito-idp:AdminSetUserMFAPreference` only for an already enrolled factor in Scenario B; and
- `cognito-idp:AdminUserGlobalSignOut` for incident session revocation.

It grants no user creation/deletion, pool administration/deletion, IAM, database, RDS Data API, or
Secrets Manager access. The existing production management-events CloudTrail records these Cognito
and STS control-plane calls. The role uses a one-hour maximum session and requires a recent IAM MFA
context at assumption. AWS notes that `aws:MultiFactorAuthPresent` is not present for federated
identities. The preferred direct Identity Center permission-set design enforces MFA upstream and
does not use this role-assumption hop. Do not weaken these conditions or accept an editable MFA
session tag as assurance merely to make a federated session work.

Nothing in this design adds a browser, API Gateway, account Lambda, or public recovery endpoint.
Unauthenticated users and application sessions cannot assume or invoke the operator role.

Do not supply this older role context or deploy it for the current root-break-glass model.
Its alternative trust principals still require separate review. Prefer federated, short-lived credentials;
do not issue long-lived access keys. A role limits only sessions using that role, so an operator
with existing broad direct Cognito permissions must not be treated as constrained by it.

Seth's Perfect Shade application **Admin** account is not AWS operator access. Sheri's sole Owner
role likewise grants no AWS permissions. The owner has selected existing protected root recovery
of AWS administration instead of a second human or dedicated emergency IAM identity. Root custody
is owner-confirmed privately; AWS indicators alone do not prove it. This does not solve Seth's
human unavailability. Never require routine root login for a Cognito account reset.

## Practical operator checklist

- [ ] Classify Scenario A, B, or C from observed Cognito state; never infer enrollment from preference.
- [ ] Obtain active-owner authorization, strong out-of-band identity proof, and a non-sensitive change reference.
- [ ] Obtain a second reviewer for Scenario C when practical.
- [ ] Confirm the exact production pool, immutable subject, expected organization, role, and enabled state.
- [ ] Verify the approved MFA-backed temporary AWS caller; use existing authorized administration or the optional scoped recovery session, never routine root or silent default-key fallback.
- [ ] Run collision checks before any email update; stop on any ambiguous or duplicate identity.
- [ ] Apply only the scenario's minimum operation; never disable pool-wide MFA or create/delete a user.
- [ ] Preserve the Cognito `sub`; record safe before/after state without secrets or private proof.
- [ ] Globally revoke sessions when warranted, then test a fresh password-plus-MFA sign-in.
- [ ] Confirm `/app`, organization, and role; separately reconcile a changed Aurora email snapshot through an approved audited process.
- [ ] Review CloudTrail, revoke operator sessions if needed, close the incident, and escalate any unexplained change.

## Isolated recovery drill plan

This larger disposable-pool design is retained as an optional separately approved test, not a
mandatory launch deployment. The minimum launch acceptance below can use one synthetic identity
in the existing production pool with separate explicit test-user authorization and controlled
inboxes. It must never use Sheri or create an Aurora Owner merely to test Cognito mechanics.

The guarded, disposable infrastructure definition and detailed acceptance/cleanup plan are in
[recovery-drill.md](./recovery-drill.md). Current operator tooling is deliberately preflight-only;
approved non-echoing secret delivery and a reviewed live drill harness remain execution gates.

Provisioning this drill requires separate authorization. Use a disposable, separately named
nonproduction Cognito pool—not production, existing development, or a real owner identity—with the
same email-username, required email/TOTP MFA, password-first public-client, administrator-only
signup/recovery, and attribute-update settings. Scope a temporary test operator role only to that
pool. Use operator-controlled test inboxes and synthetic users. The minimum resources are the pool,
one public client, the approved test email-delivery configuration, and the scoped temporary role;
Aurora, API Gateway, and application Lambdas are unnecessary for Cognito-only recovery mechanics.
Use local mocked application tests for the database email-snapshot boundary.

Execute and capture secret-safe results for:

1. forgotten password with accessible MFA mailbox;
2. lost mailbox with a pre-enrolled, usable TOTP;
3. lost mailbox with no enrolled TOTP;
4. replacement email through `AdminUpdateUserAttributes` after approved mailbox proof;
5. native email MFA delivery to the replacement mailbox;
6. unchanged Cognito `sub` before/after recovery;
7. old/new username behavior after email replacement;
8. invalid identity and unauthorized-operator denial;
9. duplicate email/alias collision denial without transfer;
10. revoked and insufficient IAM session denial;
11. global sign-out, refresh-token rejection, and repeat sign-in; and
12. interruption between steps, safe inspection, and retry without duplicate users.

Delete the disposable identities and pool only under the drill authorization after evidence review.
Expected cost is low for a short, few-user exercise but not assumed to be zero: Cognito active-user
and SES message pricing apply, and SES sandbox restrictions may require verified test recipients.
Review current pricing and quotas during approval. Never weaken production MFA or use Sheri's mailbox
to make the drill pass.

## Deployment and rollback sequence

No step below is authorized by committing this source change. After owner review:

1. Confirm the production pool still has the expected retained physical pool/client IDs, zero or
   understood users, Essentials tier, SES sender, and configuration set.
2. Run tests, syntheses, and an account-aware production `cdk diff` with the complete approved
   production context.
3. Stop if the diff replaces the User Pool, app client, Aurora, API, or SES identity. The expected
   User Pool update is in-place: `EnabledMfas` adds `EMAIL_OTP`, `UserPoolTier` is explicitly
   `ESSENTIALS`, and recovery changes from `verified_email` to `admin_only`. Leave
   `recoveryOperatorPrincipalArn` unset until the trust principal and MFA model are approved; the
   recovery role must be a separate reviewed deployment decision.
4. Deploy the compatible application challenge handling before enabling email MFA in Cognito.
5. Obtain explicit approval for the recovery-policy consequence, then deploy the CDK update.
6. With separate authorization, use one synthetic non-Sheri identity and controlled inboxes in the
   existing production pool. Verify password/email-MFA sign-in, TOTP enrollment/fallback, a temporary
   password recovery with NEW_PASSWORD_REQUIRED, unchanged `sub`, collision/unauthorized denial,
   and redacted audit. Test lost-mailbox replacement with a second controlled mailbox; no real
   customer's mail or application data. Global sign-out cannot invalidate every offline JWT before
   its expiry (currently up to one hour). Existing authorized administration handles test creation/
   cleanup; do not expand the six-operation recovery policy. No test is authorized by this document.
7. Confirm Sheri's actual login email explicitly; the contact/Reply-To Gmail is not automatically
   her account. Authorize only her `Perfect Shade` owner bootstrap, first with `--dry-run`, then
   live through `pnpm bootstrap:owner` with explicit production pool/Aurora outputs. Never print or
   supply an invitation password; Cognito sends the native initial invitation. Handle any partial
   failure through the reviewed resume path, not a duplicate user. Sheri privately completes
   NEW_PASSWORD_REQUIRED and required email MFA, and validates her sole Owner role. TOTP remains
   supported and should be enrolled/tested as an alternative; never infer enrollment from preference.
8. Sheri opens `/app/account/team`, invites Seth's confirmed application email with role **Admin**,
   and Seth privately completes his invitation/password/MFA flow. Validate estimate editing and staff
   administration while Owner-only protections remain; do not run `owner:add` or bootstrap for Seth.
9. Complete hosted production acceptance before separately authorizing the Amplify domain
   association and [controlled DNS cutover](./public-launch-cutover.md). Recheck the existing
   Route 53 authority, save current Wix web targets, use only AWS-returned certificate/web targets,
   preserve all SES/SPF/DKIM/DMARC records and no-MX decision, and retain a Wix rollback plan. No
   registrar/delegation migration is needed if Route 53 is already authoritative. Never guess targets.

To roll back, first move affected users to a functioning retained MFA factor, then disable email
MFA in Cognito, and only then roll back application handling. Do not restore `EMAIL_ONLY` recovery
while a user still uses email MFA. Never delete/recreate the retained pool or client as rollback.

## Required live acceptance

- [ ] Password plus email code succeeds; passwordless email initiation remains unavailable.
- [ ] `NEW_PASSWORD_REQUIRED` continues into email MFA without issuing an early session.
- [ ] Method selection reaches both email MFA and TOTP.
- [ ] Incorrect/expired codes and expired challenge cookies fail closed without leakage.
- [ ] Session, refresh, global sign-out, and protected-route behavior remain correct.
- [ ] Production forgot/reset pages direct staff to administrator-assisted recovery.
- [ ] Scenario A proves `AdminSetUserPassword` with `Permanent=false`, `NEW_PASSWORD_REQUIRED`, and
  normal required MFA without exposing the temporary password.
- [ ] Scenario B uses a proven existing TOTP enrollment; no preference update is treated as
  enrollment.
- [ ] Scenario C proves collision-safe replacement-email sign-in/email MFA, unchanged `sub`, and an
  explicitly tracked Aurora email-snapshot reconciliation without altering membership or role.
- [ ] The recovery operator uses explicitly reviewed existing administration or the optional exact pool-scoped recovery role, with an MFA-backed temporary session; existing protected root remains an exceptional AWS restoration path, not routine account recovery.
- [ ] Public signup remains disabled and `/sign-up` remains absent.
- [ ] SES sender, Reply-To, DKIM, configuration set, bounce/complaint/reject monitoring, and SNS
  feedback delivery remain intact.
- [ ] Development MFA remains off and development self-service email recovery still works.
