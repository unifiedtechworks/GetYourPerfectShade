# Disposable Cognito recovery drill

Source preparation only. Separate billable-resource, recipient, synthetic-user, execution, and
cleanup authorization is required. No drill has been provisioned or executed by this checkpoint.

## Isolated infrastructure

`infra/bin/recovery-drill.ts` synthesizes `PerfectShadeRecoveryDrill`, never either backend.
It creates a separately named pool, secretless public client, and test-only one-hour permission
set. No real/test users are automatically seeded. No Aurora, API, Lambda, S3, Amplify, domain,
SES identity/configuration set, DNS, or production/development pool resource is created/modified.
The test permission set has only the same six recovery operations on the new pool's ARN.
Assignments default off and use the same reviewed two-user/directory activation guard as access.

Pool: Essentials; email usernames; mutable required email; required MFA with EMAIL_OTP and SOFTWARE_TOKEN_MFA enabled;
no SMS; administrator-only signup/recovery; 12-character complex passwords; three-day temporary
password validity; no old-email retention while an attribute update awaits verification. Client:
USER_PASSWORD_AUTH/SRP/refresh only, no passwordless USER_AUTH, one-hour access/ID tokens, seven-day
refresh, token revocation enabled, and the default-equivalent three-minute Cognito auth session.
This Cognito session is separate from the application's ten-minute maximum challenge-cookie age.
Both MFA methods are available; this does not require two MFA challenges in the same login.

Use the approved existing SES domain identity with `notifications@getyourperfectshade.com` and an
explicit approved Reply-To. The drill pool omits the production configuration set so test feedback
does not silently become production workflow telemetry. Approve a dedicated test-feedback path
separately if needed. Do not alter SES/DNS or use Sheri's mailbox. Verify current SES sending state,
recipient eligibility/suppression, and expected sender permissions before a separately approved run.

Synthesis only, from `infra/`:

```powershell
npx cdk synth --app "npx ts-node --prefer-ts-exts bin/recovery-drill.ts" --no-lookups --context confirmRecoveryDrillSynthesis=true --context confirmRecoveryAccessSynthesis=true --context recoveryTargetAccount=906467472082 --context recoveryIdentityCenterInstanceArn=<VERIFIED_INSTANCE_ARN> --context recoveryIdentityStoreId=<VERIFIED_STORE_ID> --context recoveryDrillRunId=<YYYYMMDD_UNIQUE6> --context recoveryDrillSesFromEmail=notifications@getyourperfectshade.com --context recoveryDrillReplyToEmail=<APPROVED_REPLY_TO>
```

## Three synthetic users and controlled inboxes

| Fixture | Setup | Recovery case |
| --- | --- | --- |
| A | Approved inbox A, password + email MFA | Forgotten password with mailbox available |
| B | Approved inbox B, verified/enrolled usable TOTP, email preferred initially | Mailbox unavailable; prefer existing TOTP |
| C | Approved inbox C, email MFA, no usable TOTP | Mailbox unavailable; approved replacement inbox C2 |

All four addresses must be operator-controlled and individually approved. Synthetic users have
no production/development membership or customer data. Simulate lost mailbox by not using its
codes; do not disable or modify real mailboxes. Credentials/codes/TOTP seeds remain private and
in memory, never in logs/evidence. Users are created only by an independently authorized test
provisioner, not by the six-action recovery identity.

Minimum access separation:

- Test provisioner: create/delete the named disposable pool/client and the three approved fixture
  identities, plus separately approved test permission-set/assignment lifecycle. Constrain region,
  names/tags and generated pool ARN; review creation actions that require wildcard resources.
- Test recovery operator: six recovery operations, only the disposable pool; no creation/deletion,
  IAM, secrets, database, or production/development access.
- Audit/revocation reviewer: separately approved management-event/session review permissions.

The production `recover:account` command intentionally rejects this test pool/permission-set role.
Do not disable its production guard for a drill. A separately reviewed test harness using the
disposable outputs, approved secret delivery, and the scoped test identity remains required for
live mutation testing. Current mocks cover preflight boundaries but do not replace Cognito evidence.

## Evidence required before production rollout

1. A: AdminSetUserPassword(Permanent=false), NEW_PASSWORD_REQUIRED, required email MFA, fresh login.
2. B: successful existing TOTP control, authorized preference change, no enrollment inferred from preference.
3. C: no blind email-disable/TOTP-setup assumption; independent C2 mailbox proof and collision checks.
4. C: update email + email_verified=true only after proof; same subject/internal user, replacement-email
   sign-in and email MFA succeed; old email no longer signs in.
5. Attempt to replace C's email with A's: deny, preserve both subjects; never transfer an alias.
6. Incorrect/expired code/session, wrong subject, disabled user, and missing authorization fail closed.
7. Production/development pools and unauthorized IAM operations are denied for the test operator.
8. Global sign-out rejects refresh; document that offline JWT checks can accept old tokens until expiry.
9. Independent backup sign-in and expired/revoked operator-session denial; portal logout is not enough.
10. Interrupt after attribute change; inspect and retry without creating a second identity.
11. Local mocked reconciliation preserves organization/role/audit; no production/development DB mutation.

Record safe outcomes/counts and pass/fail only. No real addresses, passwords, tokens, seeds,
request bodies, or private identity proof in public reports. Do not claim live acceptance from mocks.

## Cost, cleanup, and stop conditions

For three active test users and at most 100 emails in a short drill, plan for incremental service
usage well under USD 1, excluding existing account/SES plan charges. Even if free-tier allowance is
exhausted, three Essentials MAUs at USD 0.015 each are USD 0.045; 100 outbound emails at the SES
à-la-carte USD 0.10/1000 rate are about USD 0.01. Recheck current pricing at authorization; this
estimate is not a cap. No dedicated IPs, Plus threat protection, new trail, or permanent database.

After reviewed evidence, revoke test operator access/sessions, delete only the three disposable
identities/client/pool and test permission set/assignments under the cleanup authorization, confirm
those IDs are gone, and retain secret-safe evidence. The disposable pool has deletion protection
off and deletion removal behavior; production retention/deletion protection remains unchanged.

Stop before mutation for wrong account/region or an existing production/development pool ID;
unknown operators/inboxes; unverified MFA/proof/delivery; unexpected IAM expansion or persistent
resource changes; leaked secrets; unexpected subjects/collisions; or a proposed existing-pool/SES/
DNS/database update. No automatic destructive cleanup of uncertain targets.

Pricing: [Cognito](https://aws.amazon.com/cognito/pricing/), [SES](https://aws.amazon.com/ses/pricing/).
