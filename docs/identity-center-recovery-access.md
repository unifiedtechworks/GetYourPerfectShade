# Identity Center recovery access and operator tooling

## Source-only checkpoint

The owner has selected one routine operator (Seth) plus a separately protected emergency AWS
authentication path, not a second human. The guarded `protected-emergency` alternative is described
in [Protected emergency AWS access](./protected-emergency-aws-access.md). It remains inactive until
deployment, manual assurance, and actual AWS tests are separately approved and verified. The
original `two-human` mode below remains the default/backward-compatible option. Authentication-path
redundancy does not provide human-availability redundancy.

This definition does not authorize provisioning, assignment activation, user recovery, or the
disposable drill. Production email MFA remains a separately approved rollout. Never deploy
`PerfectShadeProduction` just to configure recovery access: it also contains pending Cognito
email-MFA/recovery-policy changes. No production/development pool, database, Amplify, SES identity,
or DNS change is part of this access implementation.

The read-only review on 2026-10-10 found an active organization IAM Identity Center instance in
us-west-2 with permission sets. The ordinary `default` profile used a broad IAM user, long-lived
credentials, and no enrolled IAM MFA. Another IAM administrator also lacked MFA. Neither directory
identity was mapped to an approved operator. Identity Center/upstream MFA enforcement remains
unverified. Preserve existing administrative access until replacement and emergency access work;
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
| `recoveryOperatorMode` | Default `two-human`; alternative `protected-emergency` requires live verification |
| `primaryRecoveryUserId`, `backupRecoveryUserId` | Unset by default; two-human requires both, protected-emergency requires only primary and forbids backup |
| `recoveryEmergencyEvidencePath` | Private typed evidence JSON outside Git; only for protected-emergency activation |
| `recoveryIdentityReviewReference` | Non-sensitive owner approval of the actual human-to-ID mappings |
| `recoveryMfaReviewReference` | Non-sensitive record of MFA/enrollment review for both people |
| `recoveryEmergencyReviewReference` | Reviewed independent emergency-access/revocation procedure |
| `recoveryProvisionerProfile` | Explicit read-capable provisioning profile when activating assignments |

Example synthesis invocation, from `infra/`, with private reviewed values supplied by the operator:

```powershell
npx cdk synth --app "npx ts-node --prefer-ts-exts bin/recovery-access.ts" --no-lookups --context confirmRecoveryAccessSynthesis=true --context recoveryTargetAccount=906467472082 --context recoveryIdentityCenterInstanceArn=<VERIFIED_INSTANCE_ARN> --context recoveryIdentityStoreId=<VERIFIED_STORE_ID>
```

Assignment activation is a separate approval. In two-human mode, the entrypoint checks the instance owner/store and
uses read-only DescribeUser calls for both IDs before synthesis. Unknown users, duplicate IDs,
wildcards, wrong accounts/stores, and missing reviews fail closed. This verifies existence, not
the intended human: owner verification of both mappings is mandatory. Assignments reference only
the newly defined restricted permission set, never an input AdministratorAccess permission set.
Do not bypass the guarded entrypoint with a custom CDK app. A protected emergency-only alternative
to a second human now has its own guarded definition and verification; do not fabricate a backup ID.

## MFA, credentials, revocation, and backup

Before assigning access, the owner/Identity Center administrator must inspect Settings →
Authentication (or the upstream IdP), confirm required MFA enrollment and enforcement, and verify
an actual MFA-backed sign-in for each approved operator. For the native directory, prefer MFA at
every sign-in and required enrollment rather than a bypass for unenrolled users. For an external
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

In two-human mode, nominate a second human with separately controlled credentials/MFA. Sheri's application owner
role does not imply AWS access. If Seth loses application access, a separately authenticated AWS
operator can still act after owner identity verification. If Seth loses AWS access or his MFA,
the independent operator must remain usable. In the owner's protected-emergency mode there is no
independent human: use the separately protected IAM authentication path and accept the sole-operator
availability limitation. If Identity Center itself is unavailable, use the
separately approved, protected emergency administrative process. Root is not routine recovery;
root MFA/no-access-key indicators alone do not prove independent custody or recoverability.

The owner must name an access-revocation administrator and test both portal-session and issued
AWS-role-session revocation. Logout/removing an assignment is not proof that issued STS credentials
immediately stopped working. This is an Organizations management account: SCPs do not constrain
its principals. Follow a reviewed Identity Center/IAM session-revocation procedure appropriate to
this account, without expanding the six-operation recovery permission set.

### Emergency procedure to approve and rehearse

1. Open an incident/change record; independently verify Seth and the business owner's authorization.
   Do not use the inaccessible application or lost mailbox as the only identity-proof channel.
2. If the independent operator's SSO/MFA works, use that operator's restricted recovery session
   for an application incident. Loss of Seth's AWS identity/MFA instead goes to the separately
   designated Identity Center/upstream IdP administrator; the recovery permission set cannot reset
   AWS MFA or administer the directory.
3. If Identity Center is unavailable, follow the selected protected emergency path using separately
   controlled MFA and escrowed recovery material. The owner's selected model retains Seth as sole
   human custodian; it does not silently require/invent a second person. Optional dual-human custody
   remains available under a different approved model. Custody and the path must be privately tested before activation. Do not
   store emergency credentials in this repository or use root for routine application recovery.
4. The access administrator revokes affected portal and issued AWS-role sessions through the
   reviewed AWS/IdP procedure; independently test denial of old credentials. Restore/re-enroll the
   legitimate operator's MFA only after identity proof, then test both primary and backup access.
5. Review CloudTrail/IdP evidence, reconcile any authorized application email change through Chat 2,
   rotate exposed emergency material if needed under separate authority, and close the incident.
   Preserve existing broad IAM access until replacement and this emergency path have passed.

This procedure is not executable readiness until the independent people, custody, revocation
administrator, and emergency access path are approved. No IAM changes are authorized here.

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
Test that exact mechanism in the isolated drill. Do not substitute the old `recover:identity`
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

1. Confirm the primary mapping and selected emergency model (or both humans in two-human mode), MFA policy, emergency custody,
   session-revocation owner, and permitted token-containment window.
2. Approve the access-only permission set and assignments; verify SSO, least privilege, and backup
   access without changing production Cognito or disabling existing administration.
3. Select/implement/review secret delivery and recovery execution under separate authority.
4. Separately authorize the [disposable recovery drill](./recovery-drill.md), including inboxes,
   synthetic identities, costs, cleanup, and operator/session revocation tests.
5. After the drill passes, deploy matching Amplify challenge handling through the production gate,
   remove the release marker afterward, keep auto-build off, then review/deploy only the approved
   in-place Cognito email-MFA/admin-only-recovery diff. Do not run migrations or change DNS.
6. Obtain separate authorization for any production acceptance identity. Bootstrap Sheri just in
   time only after the accepted readiness gates; never use the sole owner as a recovery experiment.

References: [permission sets](https://docs.aws.amazon.com/singlesignon/latest/userguide/howtocmp.html),
[MFA context](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_mfa_configure-api-require.html),
[Identity Center MFA](https://docs.aws.amazon.com/singlesignon/latest/userguide/mfa-getting-started.html),
[access revocation](https://docs.aws.amazon.com/singlesignon/latest/userguide/revoke-user-permissions.html),
[emergency access](https://docs.aws.amazon.com/singlesignon/latest/userguide/emergency-access.html),
[JWT revocation limits](https://docs.aws.amazon.com/cognito/latest/developerguide/token-revocation.html).
