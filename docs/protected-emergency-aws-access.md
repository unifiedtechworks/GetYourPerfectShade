# Protected emergency AWS access

## Owner decision and source-only status

Seth / Unified Techworks is the primary routine operator. The owner chose a separately protected
AWS authentication path under Seth's control instead of a second human recovery operator.
This is **authentication-path redundancy, not human-availability redundancy**. If Seth is
unavailable, these credentials/devices do not create another person able or authorized to act.
The existing two-human Identity Center model remains available for organizations that choose it.

This checkpoint is source-only. No user, password, key, MFA registration, role, assignment, alert,
test pool, or recovery operation has been created/performed. Do not deploy either backend for
access setup. Keep production email MFA disabled live until access, delivery, and drill gates pass.
The integrated production email/TOTP/admin-assisted-recovery source is preserved; development MFA
remains OFF. Do not change databases, migrations, Amplify, SES, DNS, Wix, or registrar settings.

## Three access levels

| Path | Identity / permissions | Purpose |
| --- | --- | --- |
| Routine | Identity Center `PerfectShadeProductionRecovery`, PT1H, six operations on the production pool | Authorized application recovery after MFA-backed SSO |
| Restricted emergency | Dedicated console IAM user → fresh-MFA assumption → one-hour Cognito-only role | Same-subject application recovery when Identity Center is unavailable |
| Final administrative emergency | Separately protected management-account root | Restore AWS/Identity Center administration only when restricted access cannot repair the lockout |

The production target is account `906467472082`, region `us-west-2`, pool `us-west-2_M76kmqH14`.
The emergency user is `perfect-shade-emergency-recovery`; role is
`perfect-shade-production-emergency-recovery`. Do not substitute the existing broadly privileged
`default` IAM user. Routine SSO preflight still rejects IAM/default credentials; there is no hidden
fallback or emergency bypass in `recover:account`.

## Independent opt-in infrastructure

`infra/bin/emergency-recovery.ts` is separate from `cdk.json`, `PerfectShadeProduction`, and
`PerfectShadeDevelopment`. Its default template has no resources. Enabling its definitions requires:

- `enableEmergencyRecoveryResources=true`
- `confirmEmergencyRecoverySynthesis=true`
- `recoveryTargetAccount=906467472082`
- `emergencyAccountAuthorizationReference=<NON_SENSITIVE_CHANGE_ID>`

Synthesis is not permission to deploy. An independently reviewed account authorization and exact
CDK diff are required before any later deployment. Do not run deploy/bootstrap in this task.

The enabled definition creates one IAM user, one role, and two permissions boundaries. It creates
no LoginProfile, console password, access key, MFA device, group, or managed-policy attachment.
Until console access and MFA are manually completed, it is unusable. The user's inline policy and
boundary permit only `sts:AssumeRole` on the exact emergency role. The role's inline policy and
boundary permit only AdminGetUser, ListUsers, AdminSetUserPassword, AdminUpdateUserAttributes,
AdminSetUserMFAPreference, and AdminUserGlobalSignOut on the exact production pool ARN. No role
chaining, IAM escalation, user creation/deletion, pool administration, secrets, or database access.

Trust names the user resource's exact ARN (IAM binds its immutable principal ID), requires
`aws:MultiFactorAuthPresent=true`, and limits `aws:MultiFactorAuthAge` to 900 seconds at assumption.
The same conditions constrain the user's AssumeRole grant. Maximum role lifetime is 3600 seconds.
Freshness is checked **at assumption**, not continuously during the role's one-hour lifetime.
Federated/Identity Center callers are not this IAM principal. SCPs do not constrain this
Organizations management account; boundaries, exact trust, and session revocation are the controls.

## Execution feasibility and the separately reviewed CLI exception

Console-only login does not mean the console implements all six approved recovery operations.
The [Cognito console guide](https://docs.aws.amazon.com/cognito/latest/developerguide/how-to-manage-user-accounts.html)
documents user inspection/search. Its Reset password action sends a reset code and changes status
to RESET_REQUIRED; it is **not** AdminSetUserPassword and would require an unapproved action.

| Operation | Console-only assessment | Required path |
| --- | --- | --- |
| AdminGetUser / ListUsers | User inspection/search documented, but navigation may need extra pool-discovery permissions | SDK reads on the explicit pool avoid broad discovery grants |
| AdminSetUserPassword | Do not use the documented Reset password substitute | SDK; private input/generation and approved delivery remain blocked |
| AdminUpdateUserAttributes | User attributes visible; no verified current console contract for safe same-subject email replacement | SDK with collision/identity checks |
| AdminSetUserMFAPreference | No verified complete console contract for controlled email/TOTP preference recovery | SDK with enrollment/control evidence |
| AdminUserGlobalSignOut | No verified current console workflow covering required containment checks | SDK; document offline JWT limitations |

Do not claim console parity from API documentation, add pool-wide discovery grants just to make
navigation work, or use an administrative web endpoint. No privileged console action was tested here.

Supported candidate: AWS CLI 2.32+ `aws login` authenticates through the IAM console with hardware
MFA and produces temporary credentials without IAM access keys. The installed CLI is 2.34.41.
Unlike `aws configure mfa-login`/GetSessionToken, this supports security keys and does not require
long-lived keys. [AWS CLI login](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html),
[IAM MFA](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa.html).

This candidate needs an explicit authentication exception, absent by default:

- `enableEmergencyConsoleCliLogin=true`
- `emergencyCliAuthenticationReviewReference=<REVIEWED_CHANGE_ID>`
- Only `signin:AuthorizeOAuth2Access` and `signin:CreateOAuth2Token` on
  `arn:aws:signin:us-west-2:906467472082:oauth2/public-client/localhost`, in the IAM user's inline
  policy **and boundary**. No remote-client/wildcard grant or broad managed policy. The Cognito
  recovery role remains six-action-only.

These are authentication bootstrap permissions, not IAM self-service or direct Cognito grants;
they require separate owner approval. Never silently enable them. AWS documents this local-only
resource restriction. [Sign-In policy](https://docs.aws.amazon.com/aws-managed-policy/latest/reference/SignInLocalDevelopmentAccess.html).

After separate authorization, a protected local harness would resolve the named console-login
profile, verify the exact IAM user with STS, assume the exact role in memory, verify the resulting
role STS identity/expiry, and call the approved SDK operations. It must prove that the login-derived
session carries the required MFA context and that the 900-second condition is enforced. Documentation
does not establish that this specific trust/transport combination works; the live test gate does.
Use neither manual credential export to terminal output nor shell password arguments. No such
execution harness or live login was added/run here. A reviewed credential-process adapter may capture
CLI output privately in memory; never paste/export temporary keys into Codex or logs.

CloudShell is not granted. It would require CreateEnvironment, CreateSession, GetEnvironmentStatus,
StartEnvironment and PutCredentials permissions, some unavoidably wildcard-scoped, plus review of
persistent home/history and credential forwarding. Do not attach AWSCloudShellFullAccess.
[CloudShell permissions](https://docs.aws.amazon.com/cloudshell/latest/userguide/sec-auth-with-identities.html).

The practical execution path remains gated on the local Sign-In exception, MFA-context testing,
secure harness, and temporary-password transfer selection. **Stop before deployment if these cannot
be established.** Never solve a failure by weakening role trust or allowing permanent IAM keys.

## Primary-only activation: AWS evidence, not an approval string

`recoveryOperatorMode=protected-emergency` is an alternative to default `two-human`. Activation
still requires `activateRecoveryAssignments=true`, one exact primary USER ID, and owner identity,
MFA-policy, emergency/revocation review references. A backup USER ID is forbidden in this mode.

`recoveryEmergencyEvidencePath` names a private JSON evidence file outside Git. It contains only
the typed `EmergencyEvidence` fields in `recovery-access-config.ts`: exact user/role ARNs and
immutable IDs, reviewed directory fingerprint, two registered FIDO device ARNs, custody/CLI review
references, reviewed SNS subscription/recipient fingerprint and private receipt-review reference,
and CloudTrail IDs for primary MFA sign-in, two emergency console logins, successful
AssumeRole, no-MFA/stale-MFA assumption denials, role-scoped pool read, administrative revocation,
and denial of that same old session.
No passwords, keys, sessions, codes, seeds, mailbox addresses, or private custody locations.

The guarded entrypoint reads STS, organization-instance ownership/store, DescribeUser, current
IAM login/policies/boundaries/groups/access keys/MFA registrations, and real CloudTrail event history.
It requires an enabled console password without pending first-login reset, zero keys/groups/broad
attachments, exact least-privilege policies, matching immutable user/role IDs, two FIDO registrations,
one-hour role settings, and completed MFA-backed test use. It verifies a native primary sign-in with
PASSWORD + TOTP/WEBAUTHN, not an EXTERNAL_IDP assertion with unknown assurance. An upstream IdP
needs a separately reviewed assurance adapter; do not relax the gate.

Role use must be a real successful pool-scoped read after fresh-MFA assumption. Separate real
AccessDenied events must demonstrate no-MFA and stale-MFA assumptions are denied for the exact
emergency user/role. A credential refresh that silently defeats freshness must not pass the drill.
Revocation evidence
must include AWSRevokeOlderSessions and AccessDenied for the **same issued session**, not simply
logout, assignment removal, or token expiry. Event IDs are retrieved from AWS, bound to account,
pool, principal IDs, role/session, chronology, and a maximum 30-day evidence age. The unchanged
revocation policy must still be readable on the role. Missing/ambiguous/private-read failures deny.
The verifier accepts equivalent scalar/array policy forms and the console's short future cutoff
(bounded to one minute), never additional permissions/conditions. See
[AWS role revocation](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_revoke-sessions.html).
The verifier issues an in-memory token bound to all configuration; a forged object or changed input
cannot make the stack emit its one assignment. SNS topic/subscription reads must confirm a live
confirmed email subscription on the existing operations topic and match the reviewed recipient
fingerprint. The separate private receipt review remains mandatory; API state cannot prove inbox
receipt. No emergency role is assumed by the verifier. Never deploy a stale saved assembly to
bypass these checks; use the guarded entrypoint again for the authorized diff/deployment review.

Directory fingerprints bind reviewed attributes, not human identity proof. FIDO metadata does not
prove physical possession, non-syncable hardware, separate storage, or which key was used for each
login. Current MFA enforcement policy is not exposed by these public APIs. The owner must privately
review the actual Identity Center/IdP enforcement settings, enrollment, each key's physical test,
and custody evidence before activation; references alone are not evidence. The real AWS tests are
mandatory **in addition**. If this manual assurance is unavailable, do not authorize deployment.

## Private custody and manual setup checklist

This is a non-sensitive procedure template. Maintain the completed inventory and instructions
only in the approved private vault/offline escrow—not Git, Codex logs, screenshots, or shared notes.
Record private pointers, not secrets, in change evidence. The owner must select the custody strategy.

1. Establish working Identity Center **administration**, separate from the Cognito-only recovery set.
   Verify its actual MFA enforcement and map Seth's directory identity without guessing.
2. After explicit authorization, deploy only the reviewed access-only definition. Leave the existing
   broad human IAM access unchanged until replacement and final emergency paths are proven.
3. Through an already verified administrator session, have Seth privately set a strong unique console
   password (recommend at least 20 random characters). No CDK LoginProfile or scripted password.
   Complete any initial reset under controlled setup; the recovery user has no ChangePassword policy.
4. Register two non-syncable hardware security keys with administrator-assisted enrollment; the user
   has no automatic IAM self-service rights. Physically test each in a clean IAM sign-in. Verify IAM
   reports both registrations and record their inventory privately. Store them separately so loss/fire
   of one location does not lose both. Do not depend on the routine SSO/IdP password vault to retrieve
   the emergency password or instructions. Use a separately unlockable vault plus protected offline
   escrow, with audited access and no publicly documented custody locations.
5. Privately verify management-account root has at least two independently stored backup MFA devices,
   no access keys, a unique password, and controlled recovery email/phone independent of the normal
   IdP and primary vault. Avoid a single device/location/mailbox controlling all three access paths.
6. Establish and test alerts, the approved local temporary-credential harness, and role-session
   revocation. Complete the disposable drill first; collect redacted pass/fail evidence and AWS IDs.
7. If one key is lost, use the separately stored key; a verified administrator removes/replaces only
   the lost registration under approval. If both are lost, use the protected administrative/root
   process to restore AWS access—not Cognito identity deletion or bypassing MFA.
8. After use/compromise, review CloudTrail, revoke issued sessions through verified administration,
   rotate exposed passwords/escrow material and replace compromised keys under separate approval.
   Cache logout alone is not revocation. Rehearse at least quarterly and after significant changes.

Seth remains the sole human custodian/operator in the selected model. Device/password redundancy
does not resolve illness, absence, death, or loss of legal authority. Any future delegate is a new
owner decision; do not invent a person or silently assign one.

## Final root administrative recovery

Read-only review on 2026-10-12: root MFA indicator enabled; root access-key indicator absent.
Root device count was not available through the IAM-user review. No existing credential report
was available; none was generated. Account contact reads were denied; contact control and actual
availability are unverified. No root login/credential access was performed. Confirm these privately
through account Security credentials/contact pages and the approved owner-controlled recovery path.

Use root only when neither working Identity Center administration nor a verified protected IAM
administrator can repair AWS administrative lockout. The restricted Cognito role cannot enroll AWS
MFA, change IAM policies, restore Identity Center, or repair root recovery contacts. Open an incident,
use the separately protected root password/device/recovery contacts privately, repair only the
approved AWS administrative access, revoke affected sessions, review root/admin activity, and return
to normal SSO. Do not perform Perfect Shade user-password recovery in root or print its credentials.
If root recovery contacts are also unavailable, use the reviewed AWS account-recovery/support
procedure with privately held ownership evidence; do not improvise security-question bypasses.

## CloudTrail alerts and delivery

Existing production trail was read-only verified logging multi-region/global, all read/write
management events, with CloudWatch delivery. It captures root/admin activity; this is not proof
that a human currently receives an alert. The operations topic currently has zero confirmed,
pending, or deleted subscriptions. Alert delivery is not ready. Subscription setup/confirmation
and an approved receipt test are external blockers; no subscriptions or notifications were created/sent.

The separate emergency app has `prepareEmergencyAlerts=false` by default. Its optional definition
requires exact `emergencyTrailLogGroupName` and `emergencyOperationsTopicArn` inputs from reviewed
production outputs. It adds five dimensionless counters/alarms to that existing trail log group:
emergency IAM console login, successful emergency role assumption, failed assumption (any caller),
four production recovery mutation types, and root login/API activity. No new trail, topic, email
subscription, S3 data events, raw request logging, or high-cardinality dimensions. Imported SNS
delivery policy must be reviewed; the definition does not modify the existing topic policy.

Before activation, an authorized administrator must confirm SNS subscriptions, run approved safe
test events/notifications, verify the intended recipient receives them, and retain private receipt
evidence. Alarm transition/SNS confirmation alone is not receipt. CloudWatch alarms notify on state
transition, not every repeated event while ALARM; CloudTrail remains the per-event audit. Review
costs and any existing equivalent alarm to avoid duplication. No recipient is hard-coded here.

## Staged hardening and application boundaries

The existing default IAM user still has broad, long-lived credentials and zero enrolled MFA devices.
This risk is not fixed by a restricted role: an existing IAM administrator can change role trust or
policies. Do not retire that access prematurely or leave its current risk undocumented.

Order under separate authorizations: verify protected root access → working MFA-backed Identity
Center administration → deploy/enroll/test restricted emergency access → enroll MFA on existing
human IAM administrators → inventory/review broad policies and long-lived keys → retire only after
replacement and emergency access/revocation are independently verified. No current IAM account,
policy, credential, or device changes belong to this checkpoint.

Both application recovery paths retain human identity/scenario authorization, immutable Cognito
sub, enrollment/control proof, independent replacement-mailbox proof, collision checks, safe secret
delivery, organization membership, role, and audit history. Temporary-password transfer remains
unresolved; all existing recovery tooling is preflight-only. Email-snapshot reconciliation is a
separately approved tenant-scoped audited Chat 2 operation, not direct database editing. Already
issued offline-validated JWTs can remain usable until expiry; do not promise instant API containment.

## Remaining approvals / stop conditions

Confirm actual directory/MFA policy and root recovery/custody; approve the narrow local Sign-In
exception or another supported transport; approve safe execution/secret delivery; approve deployment,
manual password/device setup, monitoring delivery tests, disposable fixtures/costs/cleanup, and the
token-containment window. Do not activate primary-only access or email MFA until real tests and
manual assurances pass. Stop for unexpected IAM expansion, missing live evidence, unverified hardware
custody/contact control, absent alert receipt, wrong account/pool, secrets in output, or inability to
execute securely. Preserve the two-human mode if a different organization chooses it.
