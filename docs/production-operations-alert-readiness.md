# Production operations alert readiness

## Status and authority

Read-only AWS review: 2026-10-15. Source baseline:
`fef11163919ef646bb4fc6bcc669206d7264bcc0`. Profile `default`, account
`906467472082`, region `us-west-2`. STS resolved to the expected account using an IAM user.
`PerfectShadeProduction` remains `CREATE_COMPLETE`.

**Delivery is NOT ready. This checkpoint authorizes no live changes or test notifications.**
Do not run a normal `cdk deploy PerfectShadeProduction`: current main contains gated Cognito
email-MFA/admin-only recovery changes. No authentication redesign, recovery access activation,
database/migration, SES identity, DNS, Amplify, Wix, or development changes belong to this repair.

## Observed inventory

Both topics are owned by the existing `PerfectShadeProduction` CloudFormation stack:

| Purpose | Topic ARN | Confirmed / pending | Policy owner |
| --- | --- | --- | --- |
| Operations | `arn:aws:sns:us-west-2:906467472082:perfect-shade-production-operational-alarms` | 0 / 0 | `ObservabilityAlarmTopicPolicyA9C4040E` |
| SES feedback | `arn:aws:sns:us-west-2:906467472082:perfect-shade-production-ses-feedback` | 0 / 0 | `SesFeedbackTopicPolicyF684BA5C` |

Topic logical IDs: `ObservabilityAlarmTopicF724909D`, `SesFeedbackTopicFBAAA249`.
Neither topic has `KmsMasterKeyId` configured: SNS server-side KMS encryption is not enabled.
This is not a KMS authorization failure. Do not add encryption/keys in this repair: it requires
a separate publisher/KMS-policy review. Keep notification payloads free of client/secret content.

CloudFormation still reports both subscriptions `CREATE_COMPLETE`, but SNS
`GetSubscriptionAttributes` reports `NotFound` and `ListSubscriptionsByTopic` returns empty:

- `ObservabilityAlarmTopicsethunifiedtechworkscomC555A89E`:
  physical subscription suffix `5d1dd2eb-5e68-4215-a6fc-b4e7ab0027a7` on the operations ARN.
- `SesFeedbackTopicsethunifiedtechworkscomC40A1E91`:
  suffix `20bf265f-4dfb-460e-8695-7b9dd6f198c7` on the feedback ARN.

The deployed template and approved production configuration identify the intended address for
**both separate subscriptions** as `seth@unifiedtechworks.com`. The owner must reconfirm that this
is the monitored mailbox before recreation. Recipients remain configuration inputs, not new
hard-coded CDK defaults. Do not change SES From `notifications@getyourperfectshade.com` or Reply-To
`ps.perfectshade@gmail.com`.

CloudTrail shows successful CloudFormation `Subscribe` calls with `returnSubscriptionArn=true`
on October 7 at 15:57:29Z (operations) and 15:57:31Z (feedback). Stack creation completed for each.
No subsequent matching `ConfirmSubscription` or `Unsubscribe` was found in the reviewed regional
event history. October 6 unsubscribe failures belong to the prior rolled-back attempt, not proof
that the October 7 subscriptions were deliberately removed. Endpoint fields in event history are
not used as mailbox proof; the deployed template supplies the address.

The evidence is **consistent with unconfirmed-subscription expiry**, not a proven mailbox-delivery
diagnosis. AWS documents automatic removal of ordinary unconfirmed subscriptions after 48 hours
(different rules apply to email subscriptions suspended for excessive traffic). The current
inventory alone cannot prove inbox delivery, a click, spam filtering, or the precise deletion cause.
CloudFormation creation success/allocated subscription ARN does not establish confirmation.
[AWS subscription deletion behavior](https://docs.aws.amazon.com/sns/latest/dg/sns-delete-subscription-topic.html).

All 27 production metric alarms are enabled and currently `OK`; their alarm actions target the
operations topic. OK actions also use it. This does not demonstrate successful delivery.
The `perfect-shade-production-api-5xx` action history explicitly records:

> CloudWatch Alarms is not authorized to perform: SNS:Publish

RDS failure/failover rule `PerfectShadeProduction-ObservabilityDatabaseFailure-EzZTHq9tjov5` is
enabled, targets the operations topic, and retains its `events.amazonaws.com` publishing grant.
SES configuration set `perfect-shade-production-transactional` has an enabled destination for
BOUNCE, COMPLAINT and REJECT to the separate feedback topic. Its SES publishing statement is
restricted by source account and exact configuration-set ARN; no change is needed to that policy.
CloudTrail `perfect-shade-production-management` is logging and reports successful CloudWatch delivery.

## Minimal policy correction

Append this statement to the **existing operations TopicPolicy**, preserving its EventBridge
statement and all other resources. The CDK construct now does this through the same topic's
`addToResourcePolicy`; there is no second policy resource, topic, role, or alarm.

```json
{
  "Sid": "AllowProductionCloudWatchAlarms",
  "Effect": "Allow",
  "Principal": { "Service": "cloudwatch.amazonaws.com" },
  "Action": "sns:Publish",
  "Resource": "arn:aws:sns:us-west-2:906467472082:perfect-shade-production-operational-alarms",
  "Condition": {
    "StringEquals": { "aws:SourceAccount": "906467472082" },
    "ArnLike": {
      "aws:SourceArn": "arn:aws:cloudwatch:us-west-2:906467472082:alarm:perfect-shade-production-*"
    }
  }
}
```

The single alarm-name suffix wildcard covers existing production alarms and the five separately
gated recovery alarms, not development/other accounts/other regions. Topic resource and service
principal are exact; action is Publish only. No wildcard principal or identity-policy expansion.
The EventBridge statement is preserved byte-for-byte, not overwritten/tightened incidentally.
[AWS alarm publishing and source restrictions](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/Notify_Users_Alarm_Changes.html).

## Ownership-safe maintenance proposal — separate approval required

A new stack managing `AWS::SNS::TopicPolicy` for an imported topic is **not safe**: separate policy
resources would contend for the same full SNS policy. An out-of-band `set-topic-attributes` edit
would leave drift. An unchanged normal CDK subscription does not necessarily repair an expired
resource, and a full current-source production deploy would include unapproved Cognito changes.

Instead, prepare two **standard resource-level change sets on the existing stack**, using a fresh
copy of the **deployed Original template**, not a current CDK synth. No REVERT_DRIFT deployment:
do not silently reconcile unrelated live drift. This preserves CloudFormation ownership throughout
and returns the subscriptions to their existing logical IDs/desired CDK configuration in stage 2.

The offline generator `infra/bin/prepare-operations-alert-maintenance.ts` prepares:

1. `original.json`: rollback/reference snapshot (no alteration).
2. `01-detach-missing-subscriptions.json`: append the CloudWatch grant to the existing operations
   policy and remove only the two **already absent** subscription resource definitions.
3. `02-restore-subscriptions.json`: retain the grant and restore the two original email subscription
   definitions with their **original logical IDs**, topic refs, endpoints and properties.

The generator has no AWS client/subprocess/deployment capability. It rejects an unreviewed
recipient, unexpected/missing/duplicate topic-policy/subscription ownership, changed baseline policy,
transforms, or other references to a subscription being detached. It preserves every unrelated
resource, parameter, output, tag, metadata entry and deployed Lambda asset. It is not a verifier of
live absence, caller identity, mailbox control, or permission to execute. Never commit live templates
or private approval/receipt evidence. Use a fresh ignored `infra/cdk.out/` subdirectory.

Read-only collection/local artifact preparation (from `infra/`, after STS/account and stack checks):

```powershell
# Replace only after the owner reconfirms the mailbox. This does not subscribe or send mail.
$taskRecipient = '<owner-confirmed-operations-email>'
aws cloudformation get-template --stack-name PerfectShadeProduction `
  --template-stage Original --profile default --region us-west-2 --output json |
  npx ts-node --prefer-ts-exts bin/prepare-operations-alert-maintenance.ts `
    $taskRecipient cdk.out/operations-alert-maintenance-<unique-review-id>
```

Before any future change-set creation, execution, notification or resource upload, obtain explicit
approval for the following exact live scope:

- Modify `ObservabilityAlarmTopicPolicyA9C4040E` in place, with only the new statement.
- Detach/recreate the two missing subscription resources in two stages; send two confirmation emails
  to the owner-confirmed mailbox. No topic replacement or policy change on the SES feedback topic.
- If templates exceed CloudFormation's inline size limit, upload these reviewed JSON artifacts only
  to an approved private deployment-artifact bucket (not the document/audit bucket), then clean up
  just those objects after retaining the private rollback evidence.
- Send one harmless direct test on each topic and perform a separately approved CloudWatch-path
  test; these tests are **not authorized by this source-only task**.

The locally prepared stage 1/stage 2 templates are 181,360 / 182,218 bytes, so they exceed the
51,200-byte inline template limit. The later maintenance authorization must include private
template-artifact upload (or the console's reviewed private template-upload workflow). No artifact
was uploaded and no change set was created in this task.

Future operator sequence:

1. Revalidate STS account/region, stack health, topic ownership/policies, zero live subscriptions,
   and the exact deployed-template hash. Stop if a subscription now exists or state changed.
   Preserve existing stack parameters (`UsePreviousValue`), execution role, tags, stack policy,
   termination protection and notification settings. Do not use a newly synthesized template.
2. In CloudFormation's existing-stack **Create change set** workflow, use stage 1 and preserve all
   current parameter values/settings. Review property-level details. Expected changes are precisely
   one in-place TopicPolicy modify and two subscription removes. No topic, IAM, Cognito, Lambda,
   database, VPC, S3, trail, budget, anomaly monitor, route or environment changes. Stop otherwise.
3. Execute only after review/approval, wait for `UPDATE_COMPLETE`, and verify live policy contains
   the unchanged EventBridge grant plus the CloudWatch statement. If deletion of the expired physical
   subscription fails, stop and report the CloudFormation error; do not force state or run broad drift
   remediation. This provider behavior is not live-tested here.
4. Re-read the deployed template; prove it equals the reviewed stage 1. Create stage 2 change set.
   Its only changes must be the two subscription adds. No other replacement/change is acceptable.
5. Execute only after review/approval, wait for `UPDATE_COMPLETE`, and have the owner personally
   confirm both distinct AWS subscription emails promptly. Confirm receipt during the maintenance
   window, not days later; otherwise automatic expiry can recur.
6. Read SNS subscription attributes and both lists, confirm full SubscriptionArns (not
   `PendingConfirmation`), protocol/email/topic, and the intended monitored endpoint. CloudFormation
   completion and returned ARN alone are insufficient.
7. Perform the separately approved end-to-end tests below; verify the final deployed template
   matches stage 2 and the source SNS definitions. Record redacted results for Chat 4/Chat 5.

This is a feasible **staged maintenance proposal**, not a change set already created or proven safe
to execute. AWS's property-level change-set review is the final gate. If it proposes unrelated work,
stop; preserve current live settings and prepare a reviewed maintenance baseline instead of deploying
gated source or creating a conflicting policy owner.
[AWS change-set review](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-changesets-view.html).

### Rollback

Before execution, delete/cancel only the unexecuted change set under approval; no resource rollback
is required. If stage 1 fails, let CloudFormation perform its normal rollback and inspect the result;
do not reset/delete the stack. If stage 2 fails or confirmations are not delivered, retain the narrow
CloudWatch grant and investigate the mailbox/provider error; do not touch authentication or recreate
topics. Returning to the saved original template removes only the new grant and restores the old
subscription definitions, but **does not guarantee restoration of expired subscriptions or delivery**.
Any post-execution rollback is another approved, property-reviewed existing-stack update. Prefer a
forward subscription repair; never unsubscribe a newly confirmed recipient as an automatic rollback.

## Confirmation and end-to-end evidence

Under separate live-test authorization:

1. Owner reports delivery of each confirmation request and personally confirms each. Do not collect
   confirmation tokens/links in chat or logs.
2. AWS must report a confirmed subscription on **each separate topic** matching the intended address.
3. Send a harmless direct SNS verification with only a change reference/time, no business data.
   Owner confirms actual inbox receipt for operations and feedback separately. A successful Publish
   response proves acceptance, not delivery. Do not generate bounce/complaint emails to customers.
4. Verify the **CloudWatch service path**, not just an IAM user's Publish permission: with separate
   approval, create a temporary low-cost metric alarm named `perfect-shade-production-notification-verification`
   using only the operations SNS action and a dedicated synthetic metric; trigger one ALARM transition,
   inspect successful action history and require owner receipt. Do not force business alarms into ALARM.
   Remove the temporary alarm/metric publisher under the same approval; custom metric charges may
   persist for that billing period. Review duplicates and allowlist the exact test resources first.
5. Preserve the existing EventBridge RDS destination/policy; do not simulate a database failure.
   SNS receipt alone does not prove EventBridge/SES event generation. Record those routes as configured,
   with a separately approved non-disruptive event test if full end-to-end evidence is required.
6. Record redacted timestamps, alarm action state, message IDs and explicit human receipt. No
   credentials, customer data, test-message bodies, full event payloads or private evidence in Git.

No tests above were run live during this task. Existing 27 alarms need no recreation. Policy and
subscription definitions have no standing resource charge; low-volume standard SNS/email charges
are usage-based and expected to be negligible. A temporary alarm/custom metric test can cost a
small fraction of a dollar to roughly a dollar depending on billing/free tier and duration; verify
current regional pricing before approval ([SNS pricing](https://aws.amazon.com/sns/pricing/),
[CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/)). No new trail, dashboard, emergency alarms, KMS key or
production application resources are required. Budgets are notifications, not a spending cap.

## Future emergency security alerts remain disabled

The five optional definitions in `EmergencyRecoveryAlerts` create log metric filters and CloudWatch
alarms, **not EventBridge rules**: emergency console login, successful/failed emergency assumption,
production Cognito recovery mutation, root activity. All names have the permitted
`perfect-shade-production-` prefix and can use the corrected operations path. No further publisher
statement, new topic policy, or EventBridge permission is needed for these five alarms.

Prerequisites remain: separate activation/cost approval; reviewed existing trail log group/topic
inputs; confirmed mailbox and successful service-path receipt test; real CloudTrail filter test
events in the separately approved disposable drill; no equivalent duplicate alarms; MFA/custody,
revocation and secure recovery transport evidence. The source-only fix does not prove event coverage
or activate any emergency IAM access. Root activity/assumption events must actually arrive in the
selected multi-region trail's log group. CloudWatch alerts on state transitions, not every event while
ALARM. Do not enable production email MFA until its independent recovery gates pass.

## Smallest remaining operational steps

Owner reconfirms the monitored mailbox → separately approve the scoped two-stage maintenance and
tests → review/execute only the existing policy/subscription changes → personally confirm both email
subscriptions → prove harmless SNS receipt and CloudWatch alarm-path receipt. Keep all Cognito,
emergency-access, database, development, SES identity/sender, public-site and release settings unchanged.

## Repository verification at this checkpoint

- Infrastructure clean lockfile install and TypeScript build passed; 161 tests in 14 files passed.
  Regression assertions cover exact service/action/topic/source constraints, unchanged EventBridge
  and SES policies, and the maintenance generator's allowed resource footprint/refusal conditions.
- Credential-disabled, lookup-free development and production synths passed with full contexts.
- Account-aware `cdk diff --no-change-set --no-lookups` passed against both assemblies. These are
  **inspection results, not deploy approval**. Production's full current-source diff also includes
  gated `EMAIL_OTP`, `admin_only` recovery, Essentials tier, and three Lambda asset changes.
  Development's full diff includes three assets and the existing writer-dependency source change.
  Neither full assembly is the maintenance deployment input. No persistent replacement/deletion
  was proposed; no role-policy expansion appeared beyond the intended SNS resource-policy statement.
- Same-context baseline/source comparison found byte-identical bundled JavaScript for all three
  Lambdas. Asset-hash variation between the two worktrees is confined to source-map paths/line endings;
  after that verified packaging normalization, development has zero resource/configuration changes
  and production changes only `ObservabilityAlarmTopicPolicyA9C4040E`. No bundling fix was made.
- The actual deployed-template offline plan changes exactly the policy and two absent subscription
  definitions in stage 1; final stage 2 differs from the original only by the policy statement.
  All other resource/top-level JSON, including deployed Lambda assets and Cognito settings, is preserved.
- Root production/full dependency audits: zero findings. Infrastructure production/full audits:
  only the previously accepted HIGH CDK tooling-only `aws-cdk-lib/node_modules/brace-expansion`
  finding. No dependency/lockfile change or automatic audit fix.
- Changed-file credential-pattern scan: zero matches. `git diff --check` passed.
- No public/application/backend files, release controls, runtime-secret definitions or migrations
  `0001`–`0009` changed. No live AWS resources, subscriptions, policies or notifications were modified.
