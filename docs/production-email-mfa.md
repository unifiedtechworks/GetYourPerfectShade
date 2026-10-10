# Production Email MFA and Staff Recovery

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

## Administrator-assisted password and MFA recovery

Email cannot be both the user's MFA destination and self-service password-recovery destination.
Production therefore uses `AccountRecovery.NONE`, which synthesizes as the sole `admin_only`
mechanism. `/forgot-password` and `/reset-password` explain the support process in production and
do not call `ForgotPassword` or `ConfirmForgotPassword`. Development retains verified-email
self-service recovery.

Use this production process:

1. The affected staff member contacts another active owner or the approved operational
   administrator through the approved support channel.
2. The owner verifies the intended human using an approved out-of-band method and a previously
   recorded non-secret fact. Do not rely only on a message from the affected mailbox.
3. Record owner authorization and a non-sensitive incident/change reference. Use two-person review
   when practical.
4. An operator assumes the narrowly scoped administrative role and confirms the Cognito username,
   enabled status, email verification, organization membership, and role. Do not alter Aurora.
5. For a forgotten password where the MFA mailbox remains available, use
   `AdminSetUserPassword` with `Permanent=false` and a high-entropy temporary password generated
   and transferred through an approved secret channel. Do not put it in source, chat, tickets,
   logs, screenshots, or reusable shell history. The user then completes `NEW_PASSWORD_REQUIRED`
   and required MFA.
6. If the MFA mailbox is unavailable, separately authorize a per-user MFA-preference recovery.
   Use `AdminSetUserMFAPreference` to deactivate email MFA for only that verified identity. On the
   next password-first sign-in, required MFA must force TOTP enrollment. Never turn off pool-wide
   MFA, enable SMS, or change another user.
7. Confirm protected access, global sign-out, repeat sign-in, organization/role, and the expected
   MFA factor. Review CloudTrail and the change record.

`AdminResetUserPassword` is not the selected mechanism: AWS documents that it requires
self-service recovery and sends the same recovery-code flow that `admin_only` intentionally
disables. No public recovery or MFA-administration endpoint is added.

## Deployment and rollback sequence

No step below is authorized by committing this source change. After owner review:

1. Confirm the production pool still has the expected retained physical pool/client IDs, zero or
   understood users, Essentials tier, SES sender, and configuration set.
2. Run tests, syntheses, and an account-aware production `cdk diff` with the complete approved
   production context.
3. Stop if the diff replaces the User Pool, app client, Aurora, API, or SES identity. The expected
   User Pool update is in-place: `EnabledMfas` adds `EMAIL_OTP`, `UserPoolTier` is explicitly
   `ESSENTIALS`, and recovery changes from `verified_email` to `admin_only`.
4. Deploy the compatible application challenge handling before enabling email MFA in Cognito.
5. Obtain explicit approval for the recovery-policy consequence, then deploy the CDK update.
6. Run acceptance with an approved non-owner test identity before provisioning the production
   owners. Do not use the only owner as the recovery experiment.
7. Bootstrap Sheri, complete permanent-password plus email-MFA sign-in, then follow the controlled
   additional-owner process for Seth. Validate TOTP as the alternative in a separate session.

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
- [ ] A reviewed recovery drill covers password loss and lost mailbox without disabling required
  MFA or altering Aurora membership.
- [ ] Public signup remains disabled and `/sign-up` remains absent.
- [ ] SES sender, Reply-To, DKIM, configuration set, bounce/complaint/reject monitoring, and SNS
  feedback delivery remain intact.
- [ ] Development MFA remains off and development self-service email recovery still works.
