# Identity Center recovery access and operator tooling

## Source-only checkpoint

The current owner-approved model (2026-10-17) is Seth's verified `UTAdmin` Identity Center identity
for normal AWS operations, with existing protected management-account root credentials reserved
for exceptional restoration of AWS administrative access. The owner confirms physical/electronic
backups of root credentials, MFA, and recovery information. These are private owner assurances,
not something this repository or an AWS account-summary indicator can independently prove.
There is no new emergency IAM user, emergency role, password, TOTP escrow, or hardware purchase.
Root is never the routine Cognito reset identity or a provider for the recovery tool.

Sheri is the **sole application Owner**. After she is active she invites Seth as an **Admin** through
Team Management. No viewer or additional Owner is needed. Those application roles are unrelated
to AWS directory identities and confer no AWS permissions. Do not provision AWS access to make
Seth a website Admin.

Use existing authorized, suitably MFA-backed AWS administrative access for routine resets where
available. Do not assume the broad, long-lived `default` credentials are suitable. The optional
`PerfectShadeProductionRecovery` permission set remains the least-privilege alternative if separate
AWS recovery access is actually needed; it is not a website-administration or mandatory launch
dependency. No permission set or assignment is activated by this checkpoint.

The new explicit `root-break-glass` mode supports that optional single-primary assignment without
inventing a backup human or evidence for an emergency IAM deployment. `two-human` remains the
backward-compatible default; the old `protected-emergency` implementation is retained inactive
for future separately approved use, not part of the current launch plan.

This definition does not authorize provisioning, assignment activation, user recovery, or the
disposable drill. Production email MFA remains a separately approved rollout. Never deploy
`PerfectShadeProduction` just to configure recovery access: it also contains pending Cognito
email-MFA/recovery-policy changes. No production/development pool, database, Amplify, SES identity,
or DNS change is part of this access implementation.

The historical read-only review on 2026-10-10 found an active organization IAM Identity Center instance in
us-west-2 with permission sets. The ordinary `default` profile used a broad IAM user, long-lived
credentials, and no enrolled IAM MFA. Another IAM administrator also lacked MFA. Neither directory
identity was then mapped to an approved operator. The owner subsequently confirmed Seth controls
`UTAdmin`, the identity source is the native directory, and a password/authenticator login succeeded.
Keep the approved context-aware MFA policy; a cached sign-in is not proof of a fresh challenge.
No current AWS account assignment for that identity is assumed. Preserve existing administrative access until replacement and emergency access work;
do not treat the recovery role/permission set as constraining another broad administrative session.

## Independent access-only CDK app

`infra/bin/recovery-access.ts` synthesizes only `PerfectShadeRecoveryAccess`, not either backend.
It defines `PerfectShadeProductionRecovery` with a `PT1H` session and no managed policies. Its
inline policy contains only AdminGetUser, ListUsers, AdminSetUserPassword, AdminUpdateUserAttributes,
AdminSetUserMFAPreference, and AdminUserGlobalSignOut, on the one production Cognito pool ARN.
There are no IAM, pool-administration, user-creation/deletion, database, secret, or other-pool grants.
Identity Center provisions the account role when an assignment is approved; no second role hop is
required. Keep the old `recoveryOperatorPrincipalArn` option unset for this model.

Required synthesis context (values are explicit inputs, never guessed):

| Context | Requirement |
| --- | --- |
| `confirmRecoveryAccessSynthesis` | `true`; synthesis only, not deployment approval |
| `recoveryTargetAccount` | `906467472082` |
| `recoveryIdentityCenterInstanceArn` | Verified organization-instance ARN, not an account instance |
| `recoveryIdentityStoreId` | Verified store belonging to that instance |
| `activateRecoveryAssignments` | Default `false`; no assignments or directory lookups |
| `recoveryOperatorMode` | Default `two-human`; explicitly select `root-break-glass` for the current optional single-primary design; legacy `protected-emergency` remains inactive |
| `primaryRecoveryUserId`, `backupRecoveryUserId` | Unset by default; two-human requires both; root-break-glass and protected-emergency require only primary and forbid backup |
| `recoveryEmergencyEvidencePath` | Private typed evidence JSON outside Git; only for protected-emergency activation |
| `recoveryIdentityReviewReference` | Non-sensitive owner approval of the actual human-to-ID mappings |
| `recoveryMfaReviewReference` | Non-sensitive record of MFA/enrollment review for the explicitly selected operator model |
| `recoveryEmergencyReviewReference` | Reviewed independent emergency-access/revocation procedure |
| `recoveryProvisionerProfile` | Explicit read-capable provisioning profile when activating assignments |
| `confirmRootBreakGlassReadiness` | Literal `true`, only with explicit root-break-glass assignment activation |
| `rootCustodyReviewReference`, `rootRecoveryReviewReference` | Non-sensitive references to the owner's private custody and exceptional AWS restoration review; no passwords, seeds, or proof contents |
| `recoveryPrimaryMfaEventId` | Actual recent primary PASSWORD + TOTP/WEBAUTHN CloudTrail authentication event UUID; not a fabricated emergency test |

Example synthesis invocation, from `infra/`, with private reviewed values supplied by the operator:

```powershell
npx cdk synth --app "npx ts-node --prefer-ts-exts bin/recovery-access.ts" --no-lookups --context confirmRecoveryAccessSynthesis=true --context recoveryTargetAccount=906467472082 --context recoveryIdentityCenterInstanceArn=<VERIFIED_INSTANCE_ARN> --context recoveryIdentityStoreId=<VERIFIED_STORE_ID>
```

Assignment activation is a separate approval. In two-human mode, the entrypoint checks the instance owner/store and
uses read-only DescribeUser calls for both IDs before synthesis. Unknown users, duplicate IDs,
wildcards, wrong accounts/stores, and missing reviews fail closed. This verifies existence, not
the intended human: owner verification of both mappings is mandatory. Assignments reference only
the newly defined restricted permission set, never an input AdministratorAccess permission set.
Do not bypass the guarded entrypoint with a custom CDK app or fabricate a backup ID.

For optional root-break-glass activation, the guard additionally verifies the exact account,
active instance/store, primary user, a matching successful primary MFA event within 30 days,
root-MFA/no-root-access-key indicators, existing management-trail logging, and a confirmed operations
SNS subscriber. It returns an in-process verification token bound to the reviewed configuration;
the stack rejects missing/fabricated tokens. No root login or emergency IAM drill is required or
claimed. The real primary event is activation evidence, not proof every later context-aware SSO
session received a new MFA challenge. Context-aware policy is unchanged. Root indicators cannot
prove physical custody, independent recovery channels, or successful root recovery; those remain
the owner's private assurances. Activation still requires separate assignment authorization.

With `activateRecoveryAssignments=false`, leave operator IDs and root-review inputs unset. Offline
synthesis makes no directory calls and emits no assignments. It can describe an optional permission
set, but neither synthesis nor this source checkpoint authorizes deploying it.

## MFA, credentials, revocation, and backup

Before assigning access, the owner/Identity Center administrator must inspect Settings →
Authentication (or the upstream IdP), confirm required MFA enrollment and enforcement, and verify
an actual MFA-backed sign-in for each approved operator. Seth has confirmed `UTAdmin` control,
the native directory source and a password/authenticator login. The owner explicitly retains
context-aware MFA; do not change it to always-on. Cached/trusted-context sign-in is not proof of
a fresh challenge: the activation evidence still needs actual PASSWORD + TOTP/WEBAUTHN events.
For an external
IdP, verify its enforced MFA/step-up and recovery policy; directory existence is not MFA proof.

The routine CLI profile is `perfect-shade-recovery`, configured with `aws configure sso` and
authenticated interactively by the human with `aws sso login`. Do not create access keys. Select
only the new permission set, not the existing deployment/admin sets. Inspect the provisioned role
and record its exact ARN in the private operator configuration after assignment; never guess it.

The tooling resolves only `fromSSO`, verifies STS account/role identity, and requires temporary
credentials with at most one hour remaining. It rejects `default`, IAM users, other roles/accounts,
long-lived/expired credentials, more than one hour of remaining credential validity, and ordinary
environment-key credential fallback. Expiration alone does not prove the original issued lifetime;
the provisioned permission set's one-hour setting must be verified during activation. An
SSO session does not expose the IAM-user `aws:MultiFactorAuthPresent` / age conditions. These
checks do not prove a recent MFA challenge. Do not replace MFA enforcement with an editable
`MFA=true` session tag or remove the old trust conditions. A strict 15-minute step-up requirement
needs separately reviewed IdP assurance; the one-hour session is not equivalent to that condition.

In the current root-break-glass model there is one human AWS operator. If Seth loses only application
access, separately authenticated, authorized AWS administration can recover that same Cognito user.
If Identity Center/MFA or normal AWS administration is unavailable, the owner may use protected root
to restore normal administration, then end the root session. Accept the sole-human availability risk:
credential backups do not help if Seth himself is unavailable. No second human is fabricated or
required by the current decision. The old two-human and dedicated emergency IAM/MFA procedures are
retained as inactive alternatives in [Protected emergency AWS access](./protected-emergency-aws-access.md).

The owner must name an access-revocation administrator and test both portal-session and issued
AWS-role-session revocation. Logout/removing an assignment is not proof that issued STS credentials
immediately stopped working. This is an Organizations management account: SCPs do not constrain
its principals. Follow a reviewed Identity Center/IAM session-revocation procedure appropriate to
this account, without expanding the six-operation recovery permission set.

### Emergency procedure to approve and rehearse

1. Open an incident/change record; independently verify Seth and the business owner's authorization.
   Do not use the inaccessible application or lost mailbox as the only identity-proof channel.
2. For an application incident, use an existing explicitly authorized MFA-backed administrative
   session, or the optional restricted SSO recovery session if separately activated. The restricted
   permission set cannot reset AWS MFA or administer Identity Center.
3. If normal AWS access is unavailable, use the existing protected root recovery path only to
   restore administrative access. Independently verify identity, review the root sign-in in existing
   CloudTrail, and end the root session promptly. No new emergency IAM user, role, MFA device, or
   local-client Sign-In exception is part of this procedure. Do not record root secrets in Git.
4. The access administrator revokes affected portal and issued AWS-role sessions through the
   reviewed AWS/IdP procedure; independently test denial of old credentials. Restore/re-enroll the
   legitimate operator's MFA only after identity proof, then verify restored primary administration.
5. Review CloudTrail/IdP evidence, reconcile any authorized application email change through Chat 2,
   rotate exposed emergency material if needed under separate authority, and close the incident.
   Preserve existing broad IAM access until replacement and this emergency path have passed.

The owner has approved the root fallback and privately confirmed backups. Routine AWS operator
authorization, an appropriate authenticated session, and the recovery execution/handoff procedure
still need verification before an actual account reset. No IAM changes are authorized here.

## Preflight-only recovery command

`pnpm recover:account -- --config <private-operator.json> --request <private-request.json> --dry-run`
validates configuration without AWS calls. Replace `--dry-run` with `--preflight` for STS and
Cognito reads only. Neither mode performs recovery. `--execute`, password flags, and all other
mutation flags are rejected without echoing argument values. Keep both JSON files outside Git,
with operator-only access; do not include credentials, passwords, codes, seeds, or private proof.

Operator configuration keys:

```json
{
  "accountId": "906467472082",
  "region": "us-west-2",
  "userPoolId": "us-west-2_M76kmqH14",
  "profile": "perfect-shade-recovery",
  "approvedRecoveryRoleArn": "<EXACT_VERIFIED_IDENTITY_CENTER_RECOVERY_ROLE_ARN>",
  "mfaReviewReference": "<NON_SENSITIVE_REVIEW_REFERENCE>",
  "emergencyReviewReference": "<NON_SENSITIVE_REVIEW_REFERENCE>"
}
```

Request keys: `scenario` (`password`, `totp`, or `email`), `targetUsername` (immutable internal
Cognito username, not a guessed mutable email), `expectedSubject`, `authorizationReference`,
`identityReviewReference`, `membershipReviewReference`, and `factorControlReviewReference`.
Only `email` accepts/requires `replacementEmail`. References are non-sensitive change IDs, not
the evidence itself. Obtain active-owner approval and independent identity/factor/mailbox-control
evidence before creating the request. A reference is not a cryptographic identity/MFA proof.

The preflight verifies enabled local-user status, verified email, internal username, and exact
immutable subject. TOTP requires an observed SOFTWARE_TOKEN_MFA setting plus the independently
recorded successful authenticator-control review; preference is never enrollment proof. Email
replacement checks all matching Cognito results for collision, rejects ambiguous results, and
supports read-only inspection when the same-subject replacement already occurred. Output contains
only safe result categories, never subjects, emails, references, passwords, session values, or raw
SDK errors. The command has no database adapter and does not verify Aurora membership itself;
an authorized owner/reviewer must confirm organization/role read-only through the approved path.

[`ListUsers`](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_ListUsers.html)
is eventually consistent: this preflight is point-in-time inspection, not an email reservation.
The later executor must repeat collision/subject checks immediately before a change, include an
AdminGetUser alias lookup where applicable, and deny any service-side alias collision without
transferring an alias or creating/deleting users. Uncertain results must block execution.

### Deliberate execution block

The approved temporary-password delivery mechanism is not selected. All scenarios are therefore
preflight-only. No password is generated, displayed, prompted, stored, or passed to AWS by this
implementation. Before adding execution, approve an audited non-echoing input/generation tool
and one-time secret delivery channel. Pass the secret directly in memory to the SDK, never through
shell arguments, environment variables, files, transcripts, normal output, or reusable history.
Test that exact mechanism with a separately authorized synthetic identity before a real recovery. Do not substitute the old `recover:identity`
command: it relinks different identities and is not this same-subject recovery workflow.

Proposed secret-handling design for the later execution review: generate at least 20 characters
in memory with Node's cryptographic random generator, unbiased selection from an approved
Cognito-compatible alphabet, and all four password classes; alternatively accept terminal input
with echo disabled and fail closed when no private terminal is available. No clipboard automation,
SDK debug logging, crash-body capture, or persistent password storage. A separately approved
one-time delivery channel must verify the intended recipient independently and expire/revoke the
handoff. [`AdminSetUserPassword`](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminSetUserPassword.html)
does not itself deliver the temporary password; do not assume Cognito will email it. The selected
channel and its audit/redaction tests remain owner decisions.

The six IAM grants intentionally permit approved administrative actions outside this preflight
tool; the tool is not a technical restriction on a trusted operator issuing SDK calls directly.
Per-incident authorization and operator controls remain mandatory.

## Membership, audit, and session boundaries

Recovery must retain the Cognito user/sub, membership, role, and prior application audit history.
There is no creation, deletion, relinking, migration, or Aurora mutation here. Email replacement
does not reconcile `app.profiles.email_snapshot`; an organization-scoped audited application
operation remains a separate Chat 2 dependency. Keep affected incidents open until reconciled;
do not manually edit database rows. CloudTrail management events provide AWS action audit, not
a replacement for the application reconciliation audit. Use a separate approved audit reader.

AdminUserGlobalSignOut rejects Cognito refresh/token-authorized operations, but offline JWT
signature/expiry checks (including the existing application and HTTP API authorizer) can accept
already-issued tokens until expiry. Access/ID tokens currently last one hour. Do not promise
instant API containment; document/test the window and separately authorize any stronger
membership/incident-containment workflow.

## Next approvals and order

1. Verify an existing authorized, MFA-backed AWS administrative path suitable for Cognito resets.
   Preserve current access; do not treat un-MFA long-lived `default` keys as the approved routine path.
   If none is suitable, separately approve the optional six-operation SSO assignment; it is not
   needed merely for Seth's application Admin role. Keep Identity Center context-aware.
2. Select the private one-time password handoff and implement/review the small local executor.
   The current SSO-only `recover:account` remains read-only and must not gain a default/root fallback.
   A future existing-admin adapter needs an exact approved temporary caller allowlist, STS/pool/sub
   checks, redaction, and per-incident authorization, not arbitrary credential-provider fallback.
3. Separately authorize one synthetic non-Sheri identity and controlled inboxes for the minimum
   password/email/TOTP recovery acceptance in the existing production pool. No Aurora owner or new
   pool is needed for Cognito-only checks. Provisioning/cleanup uses existing authorized administration,
   never adds user-create/delete grants to the six-operation permission set. A larger
   [disposable drill](./recovery-drill.md) remains optional, not a new launch infrastructure gate.
4. Review the complete production diff, deploy compatible application challenge handling through
   the release guard first, then separately approve only the required in-place Cognito email-MFA/
   admin-only-recovery change. Verify synthetic sign-in/recovery before creating the real owner.
   Required MFA and TOTP remain on, SMS/signup off; no pool replacement or migration.
5. Confirm Sheri's login email (do not infer it from the contact Gmail), then authorize the one
   `Perfect Shade` owner bootstrap. Sheri privately completes NEW_PASSWORD_REQUIRED and required
   MFA; she then invites Seth with role **Admin**, not Owner, using Team Management.
6. Complete owner/Admin acceptance on the guarded production hosting, then separately approve
   the [domain association/cutover](./public-launch-cutover.md). No DNS action is authorized here.

The abandoned emergency-IAM CREATE change set was deleted on 2026-10-17 after confirming it was
unexecuted and its stack had zero resources. Its empty `PerfectShadeEmergencyRecovery`
`REVIEW_IN_PROGRESS` placeholder remained; deleting that placeholder requires separate approval.
Do not recreate or execute the canceled change set. The uncommitted notification-completion
runbook evidence in the separate alert-readiness worktree must be checkpointed separately, not
discarded or silently included in this source branch.

References: [permission sets](https://docs.aws.amazon.com/singlesignon/latest/userguide/howtocmp.html),
[MFA context](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_configure-api-require.html),
[Identity Center MFA](https://docs.aws.amazon.com/singlesignon/latest/userguide/mfa-getting-started.html),
[access revocation](https://docs.aws.amazon.com/singlesignon/latest/userguide/revoke-user-permissions.html),
[emergency access](https://docs.aws.amazon.com/singlesignon/latest/userguide/emergency-access.html),
[JWT revocation limits](https://docs.aws.amazon.com/cognito/latest/developerguide/token-revocation.html).
