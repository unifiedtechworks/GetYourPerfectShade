# Protected emergency AWS access

## Current decision: dedicated emergency IAM deployment canceled

On 2026-10-17 the owner superseded the dedicated emergency IAM design below. Keep the existing
protected AWS management-account root credentials, MFA, and physical/electronic recovery backups
as the last-resort path to restore AWS administration. Root is not for routine application resets.
Seth's verified `UTAdmin` Identity Center identity remains separate from his application identity;
context-aware Identity Center MFA stays unchanged. Prefer existing authorized MFA-backed AWS
administration for resets, with the six-operation SSO permission set only an optional separately
approved least-privilege alternative. No new AWS access is needed for website administration.

Sheri will be the sole application Owner. Once active, she invites Seth as an application Admin
through Team Management. Do not bootstrap Seth as another Owner, add a viewer role, or infer that
either application role grants AWS access.

The exact unexecuted change set
`perfect-shade-emergency-access-20261017-bc20c03bc6bb/35dedc00-b4b0-4d2b-95be-fc7d7922d807`
was deleted after checking the account, CREATE_COMPLETE/AVAILABLE review state, four proposed
additions, absent IAM identities/boundaries, and zero stack resources. No IAM resources were created.
The `PerfectShadeEmergencyRecovery` placeholder remained `REVIEW_IN_PROGRESS` with zero resources;
its deletion is not authorized by the change-set-only cancellation. Do not recreate/execute the
change set or follow credential-enrollment instructions below under the current plan.

The previous implementation and procedures are retained **inactive for possible future use**,
not discarded and not launch prerequisites. No separate emergency password, phone enrollment,
seed escrow, hardware purchase, Sign-In exception, or emergency role drill is now required.
See [current recovery access and launch order](./identity-center-recovery-access.md#next-approvals-and-order).
Owner-confirmed notification delivery evidence in the separate alert-readiness worktree is
preserved uncommitted for its own documentation checkpoint; it is not overwritten by this update.

## Historical design: owner decision and source-only status

Seth / Unified Techworks is the primary routine operator. The owner chose a separately protected
AWS authentication path under Seth's control instead of a second human recovery operator.
This is **authentication-path redundancy, not human-availability redundancy**. If Seth is
unavailable, these credentials/devices do not create another person able or authorized to act.
The existing two-human Identity Center model remains available for organizations that choose it.

### No-purchase MFA decision

The owner selected `virtual-totp`: one genuinely enrolled IAM virtual MFA device on the existing
phone, with a separately protected enrollment-secret backup and a demonstrated restore/login
procedure. Two FIDO2 purchases are **not** required. TOTP is less phishing-resistant; the owner
accepts that tradeoff, not disabled MFA. Keep `hardware-fido` as an explicit optional stronger mode.
Seth confirmed control of `UTAdmin`, the Identity Center directory source, and a password plus
authenticator login. Identity Center remains **context-aware** by owner decision; do not change it.
Trusted-context SSO reuse is not evidence of a fresh MFA challenge.
Production notification delivery has passed owner-confirmed end-to-end tests. Preserve and integrate
the separate uncommitted notification completion checkpoint; older inventory observations below
describe the pre-repair state, not a newly observed delivery failure.

| Existing-equipment option | Decision and independence requirement |
| --- | --- |
| Phone TOTP plus protected offline/encrypted seed escrow | Recommended simplest no-purchase path. Restore and test the backup with the normal phone unavailable. One seed copied/restored is **one AWS enrollment**, not two independent factors. |
| Two independently enrolled virtual devices | Optional if a second trusted existing device is available. Run two separate AWS enrollments with different seeds and serial ARNs, and test each. Two entries on the same phone are not device independence. |
| Existing-device passkey | AWS supports compatible synced/device-bound passkeys; recovery must not depend on the lost phone, the same password vault, or inaccessible SSO. Windows Hello local registration is not currently supported by IAM. Not a substitute for the selected TOTP gate. |
| YubiKey FIPS 4 Series / 4.4.5, U2F-only | Specific enrollment compatibility is unverified. AWS documents FIDO2/WebAuthn and deprecated U2F; the historical `u2f/` ARN does not prove protocol support. Do not rely on this key unless an approved enrollment/use drill succeeds. |

Flipper Zero is not an approved production factor. Do not buy equipment or enroll any factor as
part of this source-only checkpoint. [AWS virtual MFA](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_enable_virtual.html),
[passkey compatibility](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_fido_supported_configurations.html),
[FIDO registration caveat](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_enable_fido.html).

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

Virtual TOTP does not change this transport gate. AWS documents browser sign-in and temporary
CLI credentials, but does not establish that this particular login/refresh path supplies both IAM
MFA context keys required by our trust. No live transport was tested here. Use a distinct local
login profile, a fresh browser MFA challenge, protected CLI cache, and an audited in-memory SDK
harness. Never run credential export visibly or put a TOTP code in shell arguments, logs, or files.
The CLI refreshes cached credentials; prove refresh cannot defeat the 900-second freshness limit.
The optional local-client Sign-In grant stays disabled and separately approved in both user policy
and boundary. `aws configure mfa-login`/GetSessionToken with permanent keys is not an alternative.

If login credentials do not carry the required MFA context, stop. Fresh TOTP-authenticated IAM
console Switch Role remains a keyless alternative for operations actually supported by the console;
it is not a promise of parity for all six recovery APIs. A separately reviewed SDK harness could
evaluate fresh `SerialNumber`/`TokenCode` on STS AssumeRole using temporary login credentials,
with non-echoing code input and real AWS proof; it is not implemented or automatically accepted
by the current verifier. Do not relax the trust or manufacture proof to make either path pass.
If no supported keyless path passes the drill, application recovery stays blocked.
[AWS console-login credentials/cache](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sign-in.html),
[MFA-protected API access](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_configure-api-require.html).

## Primary-only activation: AWS evidence, not an approval string

`recoveryOperatorMode=protected-emergency` is an alternative to default `two-human`. Activation
still requires `activateRecoveryAssignments=true`, one exact primary USER ID, and owner identity,
MFA-policy, emergency/revocation review references. A backup USER ID is forbidden in this mode.

`recoveryEmergencyEvidencePath` names a private JSON evidence file outside Git. It contains only
the typed `EmergencyEvidence` fields in `recovery-access-config.ts`: exact user/role ARNs and
immutable IDs, reviewed directory fingerprint, explicit `mfaMode`, registered device ARNs, custody/CLI review
references, reviewed SNS subscription/recipient fingerprint and private receipt-review reference,
and CloudTrail IDs for primary MFA sign-in, two emergency console logins, successful
AssumeRole, no-MFA/stale-MFA assumption denials, role-scoped pool read, administrative revocation,
and denial of that same old session.
No passwords, keys, sessions, codes, seeds, mailbox addresses, or private custody locations.

The guarded entrypoint reads STS, organization-instance ownership/store, DescribeUser, current
IAM login/policies/boundaries/groups/access keys/MFA registrations, and real CloudTrail event history.
It requires an enabled console password without pending first-login reset, zero keys/groups/broad
attachments, exact least-privilege policies, matching immutable user/role IDs, mode-specific registrations,
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

### Mode-specific evidence (no secrets)

There is no implicit MFA-mode fallback. The private `EmergencyEvidence` must explicitly select:

- `mfaMode=hardware-fido`: exactly two reviewed FIDO registration ARNs; existing certification,
  AWS sign-in, role use, denial, revocation and custody gates remain intact.
- `mfaMode=virtual-totp`: assigned virtual device ARN(s), plus `virtualTotpRecovery` containing
  only `method`, `recoveryReviewReference`, `passwordSeparationReviewReference`, and
  `recoveryConsoleLoginEventId`. Use `method=escrow-restore` for exactly one AWS enrollment;
  `method=independent-device` requires two distinct AWS enrollments and privately verified devices.

The ordered `consoleLoginEventIds` are the normal-phone login followed by a distinct recovery
login while the normal phone is unavailable. `recoveryConsoleLoginEventId` must equal the second
ID. Both must be successful MFA-authenticated events for the exact immutable emergency IAM user,
after enrollment. The successful role assumption and pool-scoped read must follow the recovery
login; absent/reused/out-of-order events fail. All event evidence remains at most 30 days old.
Existing no-MFA/stale-MFA denial, one-hour role, same-issued-session revocation, least-privilege,
zero-access-key, primary SSO MFA and confirmed operational-email receipt gates are unchanged.

TOTP enrollment is read through user-scoped `ListMFADevices` (exact assigned ARN, username,
enable time). It does not fetch seed/QR data or call account-wide `ListVirtualMFADevices`.
ConsoleLogin proves AWS accepted MFA, not which physical device/seed copy was used. AWS metadata
cannot prove independence, restored-backup provenance, or password/seed separation: those require
the owner's private witnessed drill/custody review **as well as**, never instead of, AWS events.
Schema rejects unknown/seed-shaped fields; no seed belongs in the evidence JSON.

### Private TOTP escrow and lost-phone drill

1. Select existing protected storage before enrollment. Prefer encrypted offline storage with an
   independently available unlock method; a sealed paper seed in genuinely protected physical
   custody is an alternative. Neither the seed nor its unlock/retrieval instructions may depend on
   the phone being recovered, inaccessible SSO, the same password vault, or the emergency password.
   Do not assume any particular password manager or second device exists. If no suitable existing
   trusted restoration host and independent storage are available, readiness remains blocked.
2. Only after separate setup authorization, an approved administrator opens IAM → Users → emergency
   user → Security credentials → Assign MFA device → Authenticator app. The owner privately retains
   the initial enrollment seed directly into the chosen protected storage and completes two OTPs.
   No agent/screen capture, shared screenshot, chat, repository, ordinary unencrypted file, shell
   history, CloudFormation parameter, clipboard automation or Codex log may contain seed/QR/codes.
3. Confirm normal phone authentication. Then put the phone out of use, unlock the backup without
   phone/SSO access, restore into a trusted existing authenticator host, and perform a fresh AWS
   MFA sign-in and exact-role read. This is still one registered AWS virtual device. Record only
   non-sensitive event IDs/review references. Keep the original factor until recovery is proven.
   Remove unintended plaintext/cache copies and dispose of the drill-only seed copy privately;
   preserve the approved protected backup. A second independent device instead requires a separate
   AWS enrollment/seed and its own login test—not importing the same seed twice.
4. A recoverable seed can be cloned; exposure lets an attacker generate future OTPs. TOTP remains
   phishable. Do not co-store emergency password and seed (even two entries in one unlocked vault),
   cloud-sync both through one account, or treat encryption without independent key access as backup.
5. If the phone is genuinely lost, restore the protected backup without disabling AWS MFA. If loss
   may expose the seed, an authorized administrator replaces that enrollment after secure access is
   restored, rotates exposed passwords, revokes affected console/login and role sessions, and proves
   old-session denial. The restricted emergency user cannot reset its own IAM MFA. If backup fails,
   use independently verified administration/root recovery to repair only the IAM factor under an
   incident authorization; never remove MFA as an ordinary bypass or mutate Cognito to repair AWS.

Root needs its own independently recoverable MFA and privately verified email/phone contact path;
the same lost phone must not be the only route to root, SSO, seed decryption, and emergency mail.
An MFA-enabled indicator alone proves none of this. A root alternate MFA device, if already
available, or AWS's controlled root recovery procedure must be reviewed and tested privately.
Do not purchase two hardware keys or use root for routine application recovery. Seth remains the
sole human: illness/absence and correlated device/vault compromise are unresolved availability risks
until reviewed; this design must not be called fully independent before a successful recovery drill.
[AWS IAM/root recovery procedures](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_lost-or-broken.html).

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
4. Complete the selected explicit mode: the virtual TOTP escrow/recovery drill above, or optional
   two-key hardware enrollment. The user has no automatic IAM self-service rights. Physically test
   the normal and recovery paths, verify AWS enrollment metadata, and keep custody details private.
5. Privately verify root has independently recoverable MFA, no access keys, a unique password, and
   controlled recovery email/phone independent of the normal IdP, phone and primary vault. Use
   additional existing factors where available; do not assume device count/contact control is verified.
6. Establish and test alerts, the approved local temporary-credential harness, and role-session
   revocation. Complete the disposable drill first; collect redacted pass/fail evidence and AWS IDs.
7. For hardware mode, use the separately stored key if one is lost; replace only the lost registration
   under approval. For TOTP, follow the protected restore/reset procedure above. If all factors/backup
   fail, use protected administrative/root recovery—not Cognito identity deletion or bypassing MFA.
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

The source-only [production operations notification repair](production-operations-alert-readiness.md)
records the missing subscriptions and CloudWatch publishing authorization, with an ownership-safe
maintenance proposal. Integrating that fix is not deployment or proof of delivery; the five emergency
alerts remain disabled until separate activation and receipt-test approval.

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
