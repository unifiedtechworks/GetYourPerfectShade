# Perfect Shade final production operations

## Scope and authority

This runbook prepares `PerfectShadeProduction`; it does not authorize deployment, SES identity
creation, DNS edits, user creation, migration execution, or an Amplify production release.
Production remains isolated from development. Never reuse a development pool, database, secret,
API, bucket, document, user, or environment value.

Approved business inputs:

- organization: `Perfect Shade`;
- primary production owner: Sheri;
- secondary owner-level access: Seth / Unified Techworks through the separately controlled Chat 2
  administrative workflow, never by rerunning initial-owner bootstrap;
- SES From: `notifications@getyourperfectshade.com`;
- SES Reply-To: `ps.getyourperfectshade@gmail.com`; and
- no inbound mailbox or MX records are required for `getyourperfectshade.com`.

The From address does not need a mailbox. SES authorizes it through the verified domain identity.
Replies go to the monitored Gmail mailbox. Do not add MX records.

The `getyourperfectshade.com` SES domain identity is pre-existing and externally managed.
`PerfectShadeProduction` imports it by name and does not own the identity or its Easy DKIM DNS
records. Deleting the production stack must not delete the SES identity. Identity verification,
DKIM success, and production sending access remain external deployment prerequisites.

## Required deployment context

Production synthesis and deployment require separate context values for `sesFromEmail` and
`sesReplyToEmail`. Notification recipients remain deployment context and are not committed:

```text
sesFromEmail=notifications@getyourperfectshade.com
sesReplyToEmail=ps.getyourperfectshade@gmail.com
sesVerifiedDomain=getyourperfectshade.com
operationsNotificationEmail=<approved operations recipient>
budgetNotificationEmail=<approved budget recipient>
costAnomalyNotificationEmail=<approved cost-anomaly recipient>
cloudTrailDataEventsEnabled=false
estimateIncludeCompanySignature=true
```

The recommended recipient for all three notification contexts is the approved Unified Techworks
operations address. A distribution list can replace it later without changing architecture.

## SES and DNS activation runbook

These prerequisite steps are already complete for the current production identity. Repeat them
only for a separately authorized replacement identity or domain:

1. In Amazon SES **in `us-west-2`**, create an email identity for
   `getyourperfectshade.com`. Do not create an address identity or mailbox.
2. Select Easy DKIM and copy the exact three generated DKIM CNAME name/value pairs. Record them in
   the change ticket without private account information.
3. In the authoritative Wix DNS zone, add only those three DKIM CNAME records. Do not change the
   existing SPF, existing DKIM selector, DMARC, web records, or add MX records.
4. Wait until SES reports both domain identity verification and DKIM status as successful. Query
   the authoritative nameservers and at least one independent resolver before acceptance.
5. Configure Cognito with From `notifications@getyourperfectshade.com` and Reply-To
   `ps.getyourperfectshade@gmail.com`. Send replies only to the Gmail mailbox; the From address is
   intentionally send-only.
6. Request SES production access for transactional staff invitation, verification, and password
   recovery mail. Describe the staff-only, low-volume use case and the monitored complaint/bounce
   process accurately.
7. Confirm the production SES configuration set publishes `BOUNCE`, `COMPLAINT`, and `REJECT`
   events to the dedicated SNS feedback topic. Confirm the operations subscription before sending.
   Use the SES account suppression list and stop invitation/recovery sending when reputation is
   unhealthy.
8. With an approved non-owner test identity, validate invitation delivery, Reply-To behavior,
   `NEW_PASSWORD_REQUIRED`, TOTP enrollment, password recovery, bounce handling, and complaint
   alert routing. Do not use or disable the only production owner for this test.

## Monitoring and cost controls

The production stack defines:

- SNS delivery for alarm and recovery notifications;
- Lambda error/throttle alarms;
- API 5xx and p95 latency alarms;
- low-cardinality 401, 403, and 429 counters derived from existing JSON access logs;
- Aurora ACU, connection, deadlock, and low-free-memory alarms;
- RDS cluster failure/failover event delivery to operations;
- application document-generation duration/failure, lifecycle-failure, unexpected-error, and stale
  pending-document alarms;
- SES account bounce/complaint reputation alarms and per-message bounce/complaint/reject delivery;
- a multi-region management-events CloudTrail with log validation and a retained audit bucket;
- a USD 200 monthly production budget with actual 50/80/100 percent and forecast 80/100 percent
  alerts; and
- a daily Cost Anomaly Detection subscription for `Project=PerfectShade`, requiring both at least
  USD 10 absolute and 20 percent total impact before email notification.

The HTTP API does not expose a separate authoritative Data API failure metric. Restricted-runtime
application failures are covered by Lambda, API, and `PerfectShade/Application` error metrics.
Native Aurora 35-day PITR is configuration, not proof of recoverability: verify the recovery
window after deployment and complete a restore drill before launch.

AWS Budgets and Cost Anomaly Detection are notifications, not spending caps.

### Cost-allocation checklist

1. In Billing **Cost allocation tags**, activate the user-defined `Project` tag.
2. Confirm both environments retain `Project=PerfectShade` and their distinct
   `Environment=development|production` tags. Also retain `ManagedBy=CDK`, owner, and data
   classification tags.
3. Wait for tag activation/cost processing, then confirm Cost Explorer shows attributable Perfect
   Shade costs before trusting the tag-filtered budgets or anomaly monitor.
4. Supply approved operations, budget, and cost-anomaly recipients through CDK context.
5. Confirm every SNS email subscription and test alarm delivery during the launch window.

## CloudTrail decision

Keep the production multi-region management-events trail enabled. It records control-plane changes
with log-file validation and retained audit storage. Leave document-bucket S3 data events disabled
initially (`cloudTrailDataEventsEnabled=false`). Data events improve object-level investigation but
charge per event and can materially increase audit volume. Enable them only after the owner accepts
the cost and operators confirm how the additional records will be reviewed and retained.

## Amplify production variable isolation

Before any production `main` build:

1. Copy the five current development public values into `development` branch overrides.
2. Verify `development` still builds, then remove all development values from app-level defaults.
3. Keep app-level defaults empty or environment-neutral; never put production or development API
   and Cognito identifiers there.
4. After `PerfectShadeProduction` exists, configure `main` with only the production values below.
5. Keep the release marker absent normally. Add it only for the approved release job, then remove
   it after the job completes.

Required production `main` inventory:

```text
PERFECT_SHADE_DEPLOYMENT_ENVIRONMENT=production
PERFECT_SHADE_PRODUCTION_RELEASE_APPROVED=true
NEXT_PUBLIC_PERFECT_SHADE_ENVIRONMENT=production
NEXT_PUBLIC_AWS_REGION=us-west-2
NEXT_PUBLIC_COGNITO_USER_POOL_ID=<production output>
NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID=<production output>
NEXT_PUBLIC_API_BASE_URL=<production output>
NEXT_PUBLIC_SITE_URL=https://www.getyourperfectshade.com
PERFECT_SHADE_EXPECTED_COGNITO_USER_POOL_ID=<same production pool ID>
PERFECT_SHADE_EXPECTED_COGNITO_USER_POOL_CLIENT_ID=<same production client ID>
PERFECT_SHADE_EXPECTED_API_BASE_URL=<same production API URL>
```

The branch-aware validator fails `main` if the marker is absent, a required value is missing, an
expected value differs, or a public URL points to localhost/development. Do not modify the live
branch until the production outputs and release authority exist.

## Signature boundary

The verified Sheri signature remains a backend-only Lambda asset and is approved for generated
production client DOCX/PDF documents. It must not appear under `public/`, in Amplify artifacts,
browser preview, JSON export, logs, or telemetry. Production enablement must remain explicit and
configurable; disabling it must preserve the unsigned authorization layout.
