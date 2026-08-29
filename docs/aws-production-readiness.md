# AWS Production Readiness and Recovery Runbook

## Scope and launch status

This document records the 2026-08-18 operational review of the Perfect Shade
development environment and defines the recommended production design. It does
not authorize production provisioning, data migration, DNS changes, SES
verification, user creation, or a production launch.

Production is **not authorized to provision**. The repository now contains a
separately selectable `PerfectShadeProduction` stack and guarded production
configuration, but synthesis is readiness evidence only. Provisioning remains
blocked on the owner approvals and external prerequisites listed below.

The owner has approved the exact verified Sheri Brannan signature asset for
development-generated DOCX and PDF bids. Development uses
`ESTIMATE_INCLUDE_COMPANY_SIGNATURE=true`. The asset remains inside the
backend Lambda bundle and is not a public/browser asset. Production enablement
is part of the separately authorized production launch.

## Validated development snapshot

| Area | Validated development state | Production consequence |
| --- | --- | --- |
| Aurora | Aurora PostgreSQL 16.14, encrypted, Data API enabled, private isolated subnets, no ingress, 0–1 ACU, 15-minute auto-pause | Preserve engine and private/Data API architecture; remove auto-pause and add production protection |
| Database recovery | One-day configured backup retention, encrypted automated snapshot, PITR window available, no deletion protection | Increase retention, protect deletion, retain snapshots, and rehearse restore |
| Database secret | AWS-managed encryption, no automatic rotation | Separate runtime and migration credentials; establish rotation and recovery procedure |
| S3 documents | SSE-S3, versioning, full Block Public Access, TLS-only policy, seven-day incomplete-upload cleanup | Retain bucket and versions; do not auto-delete production documents |
| Cognito | Staff-only, administrator-created users, verified-email recovery, strong 12-character password policy, MFA off | Create a separate retained production pool and require TOTP MFA |
| SES | Cognito default sender; SES account is not production-enabled; no verified owned domain | Verify the owned domain and obtain SES production access before staff invitations/recovery |
| API | All application routes use Cognito JWT authorization; no default-stage throttling | Add reviewed production rate/burst limits and document-generation concurrency controls |
| Lambdas | ARM64 Node.js 22; account 256 MB/15 seconds; estimate 1024 MB/60 seconds/1024 MB temporary storage | Values are acceptable starting points; load-test and alarm on p95/p99 and failures |
| IAM | Resource-scoped Data API, secret, Cognito, and S3 grants; estimate S3 access is Get/Put under `organizations/*`; no List/Delete | S3 scope is good; replace use of the Aurora administrative secret with a restricted runtime credential |
| Logs | Structured platform format; Lambda/API/PostgreSQL groups retain seven days | Use longer production retention and emit safe application error/operation signals |
| Monitoring | Dashboard and seven alarms exist | Alarms have no actions, so they do not notify anyone; add SNS delivery and runbooks |
| Budget | USD 50 monthly, actual alerts at 80% and 100% | The `Project` cost-allocation tag is not active, so the filtered budget currently reports zero and cannot be trusted |
| Amplify | `development` and `main` both build successfully; `main` is labeled production and auto-builds; app-level variables point to the development backend and a localhost site URL | `main` inherits the development mapping because it has no branch overrides; production variables, custom domain, approval gate, and release procedure are missing |
| Domain | Apex redirects to `www`; `www` is currently hosted by Wix; no Amplify domain association | Plan a controlled DNS cutover; do not change DNS during infrastructure preparation |
| Account audit services | No CloudTrail trail, AWS Config recorder, GuardDuty detector, or AWS Backup plan found | CloudTrail is a launch blocker; Config/GuardDuty and backup policy require owner approval and cost review |

The development cost design remains conservative: Aurora can pause to zero ACU,
there is no NAT Gateway, and most services are usage-priced. The current budget
showing zero is not evidence of zero spend because its tag filter is not active.

## Production environment design

The repository implements a separate CDK application path; it does not rename
or mutate `PerfectShadeDevelopment` into production. Production synthesis
requires both `perfectShadeEnvironment=production` and the explicit
`confirmProductionSynthesis=true` context guard. That guard does not authorize
bootstrap or deployment.

### Repository readiness implemented 2026-08-29

- `PerfectShadeProduction` has separate production resource names, SSM prefix,
  outputs, VPC, Aurora cluster, secrets, user pool/client, API, Lambdas, roles,
  document bucket, audit bucket, alarms, SNS topic, and budget definition.
- The production Lambda environment receives only the restricted runtime-secret
  ARN. The admin/migration secret is retained separately and is not granted to
  application Lambdas.
- Development and production use the same shared runtime-credential construct.
  It generates the environment-specific `perfect_shade_app_runtime` secret and
  transactionally synchronizes that login through a deployment-only provisioner
  before either application Lambda is updated.
- Production requires administrator-created users, TOTP MFA, SES mode, and
  production-only callback/logout/CORS values. Localhost and Amplify development
  URLs fail production configuration validation.
- Aurora synthesizes at PostgreSQL 16.14, 0.5–4 ACU, no auto-pause, 35-day PITR,
  deletion protection, private isolated networking, Data API, encryption,
  retained admin secret, snapshot-on-removal, and Performance Insights.
- The document bucket synthesizes with SSE-S3, versioning, TLS enforcement,
  Block Public Access, `RETAIN`, and no automatic object deletion.
- Production alarms publish alarm and recovery notifications to a configurable
  SNS email subscription. CloudTrail records multi-region management events to
  a separate retained bucket; document-bucket data events remain an explicit
  cost-controlled context option.
- A USD 200 production budget is defined with actual 50/80/100 percent and
  forecast 80/100 percent alerts, but is created only when the production stack
  is separately deployed.
- The committed Amplify build file pins pnpm and runs a branch-aware environment
  validator. `main` fails closed unless production branch overrides and an
  explicit release-approval marker are present. Server-side expected API and
  Cognito values must exactly match the public build values.

| Component | Recommended production baseline |
| --- | --- |
| Stack | `PerfectShadeProduction` |
| Resource prefix | `perfect-shade-production` |
| Region | `us-west-2` |
| Tags | `Project=PerfectShade`, `Environment=production`, `ManagedBy=CDK`, owner and reviewed data classification |
| VPC | Separate NAT-free VPC with two private isolated subnets and a no-ingress Aurora security group |
| Aurora | Separate PostgreSQL 16.14 Serverless v2 cluster; 0.5 ACU minimum and 4 ACU initial maximum; no auto-pause; Data API; encryption; Performance Insights; tune after observed load |
| Aurora protection | Deletion protection enabled, 35-day automated backup retention, copy tags to snapshots, retained/final snapshot removal policy, maintenance/backup windows documented |
| Database identities | Separate Secrets Manager credentials for restricted application runtime and privileged migrations; never give Lambdas the migration/admin credential |
| S3 | Separate private SSE-S3 bucket, versioning, TLS-only policy, full Block Public Access, `RETAIN`, no auto-delete; move to SSE-KMS only after key ownership/recovery approval |
| Cognito | Separate staff pool and client, public signup disabled, deletion protection active, retained on stack removal, verified email, TOTP MFA required |
| API | Separate HTTP API and JWT authorizer using only the production pool/client; exact production CORS origin; stage throttles enabled |
| Lambdas | Separate roles, log groups, configuration, reserved concurrency guardrails, and production backend outputs |
| SES | Verified owned domain and approved sender in `us-west-2`; production access enabled |
| Monitoring | Production dashboard, SNS-backed alarms, CloudTrail, cost anomaly monitor, and documented responders |
| Budget | Separate production budget and cost tags; no development costs included |
| Amplify | `main` consumes only production API/Cognito/site values after launch approval; development continues to use only development outputs |

Development and production must never share an Aurora cluster, database secret,
Cognito pool/client, S3 bucket, Lambda role, API, SSM prefix, or budget. A future
account split must be possible by changing deployment account configuration,
not application tenancy behavior.

## Service readiness decisions

### Aurora

Production should not auto-pause: staff sign-in, estimate editing, and document
generation should not inherit resume latency. Begin at 0.5–4 ACU, alarm on
sustained ACU utilization, connections, Data API errors, storage, and failover,
then adjust from observed workload. Keep the NAT-free Data API architecture.

The application Lambdas now use the separate restricted runtime secret directly;
they do not receive the Aurora administrative secret and no `SET LOCAL ROLE`
workaround remains. A shared development/production deployment-only custom
resource uses the admin identity only to transactionally create or constrain
`perfect_shade_app_runtime` and synchronize its generated password. It commits
only on success, rolls back on failure, performs no destructive delete action,
and is an explicit dependency of both application Lambdas. Migrations continue
to own RLS, grants, tenant constraints, and schema; the provisioner owns only
database-login credential state.

Do not enable generic Secrets Manager rotation until the runtime-login contract
has an idempotent rotation Lambda or operator tool that updates PostgreSQL and
the secret as one reviewed workflow. The rotation runbook must test the pending
version, promote it only after a Data API probe under the restricted role, keep
the prior version for rollback, and prove Lambdas recover without receiving the
admin credential. Rotate the admin secret separately during a maintenance
window after migration tooling is validated against the new version.

Production backups should retain 35 days of PITR and use deletion protection.
An optional AWS Backup copy or cross-region copy is a later owner decision based
on outage tolerance and cost; it does not replace native PITR. Complete at
least one restore drill before launch.

For the initial single-region, 24-hour business-continuity target, Aurora native
35-day PITR plus retained/versioned S3 objects is sufficient and is the
implemented baseline. AWS Backup materially helps only when the owner approves
central policy enforcement, cross-account/cross-region copies, vault lock, or
longer independent retention. Those features add recovery copies, transfer and
storage cost, and vault/key operations; add them after a documented resilience
decision rather than duplicating backups by default.

### S3 documents

Do not set `autoDeleteObjects` in production. Use `RETAIN` and preserve
versioning. Do not expire issued-estimate objects or noncurrent versions until
the owner approves legal/business retention. A conservative launch posture is
indefinite retention, followed by a reviewed transition to lower-cost storage
without deletion. Object Lock remains deferred until legal retention and
governance/complaint mode are explicitly approved.

Five-minute presigned downloads are appropriate. Keep S3 keys server-derived,
avoid `ListBucket`, prohibit public policies/ACLs, and alarm on denied or failed
document writes using application metrics rather than S3 access-log contents.

SSE-S3 is the implemented launch default because it provides encryption at rest
without a customer-managed-key monthly charge, per-request KMS charges, key
policy failure mode, or separate key-recovery obligation. SSE-KMS with bucket
keys adds key-level audit/control and can reduce KMS request costs, but losing or
disabling the key makes retained documents unavailable. Adopt it only after the
owner approves key administrators, deletion protection, rotation, incident
recovery, and its continuing cost.

### Cognito and MFA

Use a separate retained production pool. TOTP MFA should be **required for all
staff**, which necessarily protects owner and admin accounts and avoids fragile
role-dependent enforcement after token issuance. SMS MFA is not recommended.
If launch readiness makes pool-wide MFA impossible, production must not proceed
until an explicitly reviewed privileged-user enforcement design exists.

The application implements `MFA_SETUP`, software-token association and
verification, `SOFTWARE_TOKEN_MFA`, short-lived fail-closed challenge state,
and the `NEW_PASSWORD_REQUIRED` to MFA sequence. The production pool keeps MFA
required; complete a nonproduction enrollment/recovery drill before launch.

Cognito passwords, MFA seeds, and active sessions cannot be backed up or
restored. Recovery recreates the pool and administrator-provisioned identities,
then uses the reviewed database relinking process; users set new passwords and
reenroll MFA. The repository-side CLI, migration, and runbook are implemented in
[`production-identity-readiness.md`](./production-identity-readiness.md); Chat 5 must still run a
nonproduction recovery drill before launch.

### SES

Before production:

1. Verify the owned sending domain in `us-west-2`.
2. Publish SES DKIM records and confirm successful verification.
3. Publish/confirm SPF alignment for the selected MAIL FROM arrangement.
4. Publish DMARC initially in monitoring mode, review reports, then strengthen
   policy after all legitimate senders are aligned.
5. Request SES production access and establish bounce/complaint handling.
6. Use a role address such as `no-reply@<owned-domain>` with a monitored reply-to.
7. Configure the production Cognito pool to use that SES identity.
8. Use a separately reviewed SES Lambda/application path for transactional bid
   delivery; do not overload Cognito's sender integration.

No production identity or DNS record should be created until the owner approves
the sender domain, address, recipients, and operational mailbox.

The production template defines the SES domain identity and alarms on account
bounce/complaint reputation metrics. Deployment still requires externally
published DKIM/SPF/DMARC records, confirmed SES production access, SNS/event
handling for individual bounce/complaint events, and a monitored suppression
and reply workflow.

### API and Lambda

The current JWT authorizer, audience, short access/ID tokens, secret-free browser
client, forced RLS, idempotency, and tenant resolution are sound foundations.
Add production stage throttling after a small load test; start conservatively
around 20 requests/second with a burst of 40 and add a lower application-level
document-generation concurrency limit. Confirm limits against actual staff use.

The 256 MB/15-second account Lambda and 1024 MB/60-second/1024 MB estimate Lambda
are reasonable launch values. Alarm before the timeout, measure DOCX/PDF p95 and
p99 separately, and add reserved concurrency only after measuring document
generation. Keep the pure-JavaScript document stack and backend-only signature.

Known and unexpected application failures now emit allow-listed structured logs
with request ID, operation, route template, safe error category/code, duration,
outcome, and status. They do not accept raw exceptions, request bodies, customer
fields, document bytes, S3 keys, SQL, credentials, ARNs, or presigned URLs.
`PerfectShade/Application` EMF covers handler errors, operation and document
duration, document generation, lifecycle failures, and pending/stale-pending
documents. Production alarms consume that exact namespace and finite dimension
contract rather than defining a parallel application metric vocabulary.

### CloudWatch and audit services

Retain application/API logs for at least 30 days and PostgreSQL/audit logs for
at least 90 days initially, then tune after cost and incident-review experience.
Never log passwords, tokens, customer/document content, full events, secret
values, raw SQL, object keys, or signed URLs.

Add SNS actions and owned runbooks to all production alarms. At minimum alarm on:

- API 5xx, latency, and abnormal 401/403/429 volume;
- Lambda errors, throttles, timeouts, p95 duration, concurrency, and custom
  handled-failure metrics;
- document-generation failure rate and pending records older than a threshold;
- Aurora ACU utilization, Data API failures, connections, storage, and failover;
- S3 write/authorization failures;
- Cognito invitation/recovery failures;
- SES bounce and complaint rates;
- backup failure or missing recovery point; and
- budget/cost anomaly thresholds.

Create a multi-region CloudTrail management-events trail with log-file
validation and a retained, encrypted audit bucket. Add narrowly scoped S3 data
events for the production document bucket only after estimating event volume.
AWS Config and GuardDuty are recommended account-level controls subject to the
owner's account-wide cost and governance decision.

### Budget and cost controls

First activate the `Project` user-defined cost-allocation tag and verify tagged
costs appear. Keep the USD 50 development budget, but add actual alerts at 50%,
80%, and 100% plus a forecast alert at 80%. Confirm at least two monitored
recipients or a monitored operations distribution list.

Start production with a separate USD 200 monthly budget, actual alerts at 50%,
80%, and 100%, forecast alerts at 80% and 100%, and an AWS Cost Anomaly Monitor
for the Perfect Shade tag. This is an alerting baseline, not a spending cap.
Prefer one environment budget plus service-level CloudWatch alarms; create
service-specific budgets only if measured costs justify the added operations.

### Amplify and release management

The existing `main` branch is marked `PRODUCTION`, automatically builds every
push, and currently has no branch-specific environment variables or custom
domain. The Amplify app-level variables point to the development API/Cognito
resources and a localhost site URL, so `main` inherits an invalid and
environment-crossing mapping. The customer domain still resolves to Wix, which
limits current exposure, but the generated `main` Amplify URL must not be
treated as a production account application. Before enabling protected
production routes:

1. Protect GitHub `main` with required review and required test/build checks.
2. Pin the pnpm version instead of installing `pnpm@latest` in every build.
3. Decide whether to disable Amplify auto-build for `main`; the recommended
   launch procedure is an explicitly started build from an approved commit.
4. Move development values to development-only branch overrides, remove the
   development mapping from app-level defaults, and configure all six production
   `NEXT_PUBLIC_*` values from production outputs on `main`.
5. Confirm no development ID, URL, secret, or customer data is present.
6. Test public, authentication, protected, document, and print routes.
7. Record the Amplify job ID and commit in the release log.

Review the current catch-all `404-200` rewrite before launch so genuine missing
routes, especially `/sign-up`, keep the intended 404 behavior under SSR.

## Domain and DNS plan

The current apex redirects to `www`, and `www` is served by Wix. Preserve that
SEO convention during cutover:

- canonical production site: `https://www.getyourperfectshade.com`;
- apex: HTTPS redirect to the canonical `www` URL;
- development: keep the generated Amplify URL initially, or later add
  `dev.getyourperfectshade.com` only after separate approval;
- production callback:
  `https://www.getyourperfectshade.com/auth/callback`;
- production logout:
  `https://www.getyourperfectshade.com/sign-in`;
- production API CORS origin:
  `https://www.getyourperfectshade.com`.

Use Amplify managed HTTPS certificates and domain association. Before cutover,
inventory the authoritative DNS provider and preserve MX, SPF, DKIM, DMARC, and
other non-web records. Lower TTLs, validate Amplify ownership records, test the
generated Amplify domain, then change only apex/www records in an approved
window. Keep the prior Wix values as the DNS rollback plan until acceptance is
complete.

## Production deployment order

1. Approve account, region, naming, retention, MFA, SES sender, budget,
   responders, and launch window.
2. Activate cost-allocation tags and establish CloudTrail/notification targets.
3. Verify SES domain/DKIM and obtain production sending access.
4. Implement and review `PerfectShadeProduction`; synthesize and test without
   credentials, then run an account-aware diff.
5. Confirm the diff creates only new production resources and never changes
   development resources.
6. Bootstrap the production environment only if required and separately approved.
7. Deploy the production backend with no application traffic.
8. Record outputs securely; verify deletion/retention/backup policies.
9. Run migration `status`, then `plan`; review exact filenames/checksums.
10. Take/verify a recovery point, then apply forward-only migrations in order.
11. Confirm `0001` through `0008` are applied with no mismatch or gap.
12. Run owner bootstrap dry-run, then the separately authorized live bootstrap.
13. Configure production Amplify variables and deploy the approved commit.
14. Complete authenticated acceptance, MFA enrollment, tenant/RLS, document,
    print, backup, alarm, and recovery smoke tests.
15. Associate the custom domain and execute the DNS cutover.
16. Monitor errors, latency, SES, database capacity, and cost through the launch
    window; record final acceptance.

## Rollback rules

- Application/Lambda defect: deploy the last known-good application asset;
  preserve database and documents.
- CloudFormation failure: allow CloudFormation rollback and investigate; never
  bypass a replacement warning for a persistent resource.
- Migration failure: stop, confirm transaction rollback, correct only an
  unapplied migration in a new reviewed commit, and rerun status/plan. Never
  edit applied migration bytes or history.
- Committed incompatible schema: use a reviewed forward migration. PITR is an
  incident-level last resort, not a routine schema rollback.
- Amplify defect: redeploy the last accepted commit/job with unchanged production
  variables.
- DNS defect: restore recorded Wix apex/www values; do not change email records.
- Cognito/SES defect: stop invitations and recovery traffic; do not create
  duplicate users while partial state is under investigation.

## Recovery runbook

### 1. Declare and contain

Record incident time, affected environment, last known-good application commit,
last successful migration, and desired recovery point. Stop deployments and
mutating traffic. Preserve logs and do not delete the impaired cluster, pool,
bucket, secrets, or document metadata.

### 2. Restore Aurora

1. Choose the latest safe PITR timestamp within the retained window.
2. Restore to a **new** production cluster; never overwrite the source.
3. Keep it private, encrypted, Data API-enabled, and isolated.
4. Validate database connectivity and migration history with `status` only.
5. Confirm organization, owner membership, audit, estimate, revision, and
   document metadata integrity using aggregate/synthetic checks.
6. Run tenant-isolation and issued-estimate immutability tests.
7. Point a recovery Lambda deployment at the restored cluster/secret through a
   reviewed CDK change; do not hand-edit live Lambda variables.
8. Retain the old cluster until acceptance and owner-approved disposal.

### 3. Recover S3 documents

Use S3 version listing for a known document ID/key resolved through authorized
metadata. Restore the required prior version by copying it to a new current
version. Do not make the bucket or object public. Compare stored checksum,
version ID, size, document record, and authorized download. If Aurora was
restored to an earlier time, reconcile document rows and S3 versions with a
reviewed, non-destructive report before any repair.

### 4. Recover Cognito

Cognito passwords, MFA seeds, and sessions are unrecoverable. If the pool is
lost, deploy a new retained production pool, administrator-provision staff,
require password reset and MFA reenrollment, and use a reviewed owner-controlled
procedure to relink database profiles/memberships to new Cognito subjects. Follow the exact
preflight/execute process in
[`production-identity-readiness.md`](./production-identity-readiness.md#production-account-recovery).
Never rerun owner bootstrap blindly or create duplicate memberships. Test this
procedure before production launch.

### 5. Redeploy CDK and secrets

Deploy the last accepted CDK/application commit into the approved recovery
environment. Restore configuration from source-controlled context and recorded
non-secret outputs. Rotate compromised credentials and update CDK-managed
references; never copy secret values into Amplify, source, tickets, or logs.

### 6. Restore migrations and owner state

Run migration `status` and `plan`. Apply only genuinely pending forward
migrations after the restored database is accepted. If owner bootstrap is
incomplete, use its documented dry-run and `--resume-existing-user` path only
after verifying Cognito and Aurora state.

### 7. Restore Amplify and DNS

Deploy the last accepted commit with the production output mapping, validate on
the generated Amplify domain, then restore/confirm the custom domain. If DNS is
impaired, use the generated Amplify URL for operator validation; do not expose
an unapproved alternate production domain to customers.

### 8. Acceptance and closeout

Validate public pages, staff sign-in/MFA, permissions, estimates, issuance,
revisions, DOCX/PDF/JSON generation, signed output, document history, private
downloads, print layout, alarms, backups, and audit events. Record actual RTO,
RPO, data reconciliation, and follow-up actions.

The approved 24-hour recovery target remains a reasonable initial business
continuity ceiling for this small staff application, but it is too loose as an
operational objective once bids are issued daily. Before launch, demonstrate a
four-hour service restore in a drill. Target database RPO is the native PITR
window (approximately five minutes); S3 versioning provides near-zero object
RPO for retained versions. Tighten targets after two successful drills.

## Production acceptance and go-live checklist

Before checking recovery acceptance, run a drill that records owners, start/end
times, chosen recovery point, actual RTO/RPO, and cleanup authorization:

- [ ] Restore Aurora PITR to a new isolated cluster and run migration `status`.
- [ ] Validate tenant/RLS, owner membership, estimates, revisions, document
  metadata, and issued immutability using aggregate or synthetic checks.
- [ ] Restore a prior S3 object version without making the bucket public.
- [ ] Reconcile restored database metadata with retained S3 versions.
- [ ] Rehearse Cognito pool recreation, user relinking, password reset, and TOTP
  reenrollment without duplicating owner membership.
- [ ] Redeploy the accepted CDK/application commit to the recovery target and
  rotate compromised/test credentials.
- [ ] Validate generated Amplify hosting before any DNS restoration.
- [ ] Exercise alarm delivery, operator acknowledgement, escalation, and the
  Wix DNS rollback record set.
- [ ] Demonstrate recovery within four hours before launch; record why any miss
  remains acceptable or repeat the drill.

- [ ] Separate production stack/configuration is reviewed and authorized.
- [ ] CDK diff creates no development changes or persistent replacements.
- [ ] Runtime database credential is separated from the migration/admin secret.
- [ ] Runtime-login provisioning order, direct runtime Data API identity, denied
  DDL/role operations, and admin-secret absence from application IAM are proven
  in the production CDK diff and smoke test.
- [ ] `PerfectShade/Application` EMF metrics, stale-document warning, production
  log retention, and operational alarm routing are verified.
- [ ] Aurora deletion protection, 35-day PITR, retained snapshots, and restore
  drill are verified.
- [ ] S3 uses `RETAIN`, no auto-delete, versioning, encryption, Block Public
  Access, TLS enforcement, and approved retention.
- [ ] Production Cognito is separate, retained, staff-only, and requires TOTP.
- [ ] Cognito recovery/relink drill is completed.
- [ ] SES domain, DKIM, SPF/DMARC alignment, production access, and
  bounce/complaint handling are verified.
- [ ] Exact production callbacks, logout URL, CORS origin, and Amplify variables
  are configured.
- [ ] `main` protection, pinned build toolchain, release approval, and rollback
  job are documented.
- [ ] CloudTrail and alarm notification delivery are tested.
- [ ] Cost-allocation tag, USD 200 production budget, forecast alerts, and cost
  anomaly monitor are active.
- [ ] Dependencies have no unresolved launch-blocking advisories.
- [ ] Application errors emit safe structured logs/custom metrics.
- [ ] Migrations `0001`–`0008` and owner bootstrap are verified in production.
- [ ] Tenant isolation, roles, issued immutability, documents, signature,
  downloads, print, and `/sign-up` absence pass acceptance.
- [ ] DNS inventory, TTL reduction, Wix rollback values, Amplify certificate,
  apex redirect, and `www` cutover are approved.
- [ ] Owner records final go-live authorization.

## Current blockers and risk ranking

### Blocking production provisioning

1. Owner approval is still required for the production AWS account, region,
   canonical URLs, sender domain/address, operations recipient, budget recipient,
   and whether SSE-S3 remains the launch encryption choice.
2. The shared runtime-login provisioner and rotation procedure must be reviewed
   with the runtime/database owner and proven first in non-production.
3. SES domain verification/DKIM, production sending access, and monitored
   bounce/complaint handling are not complete.
4. The `Project` cost-allocation tag must be activated and shown to produce
   attributable costs before the filtered production budget is trusted.
5. The account-level impact/cost of CloudTrail ownership, optional S3 data
   events, Cost Anomaly Detection, AWS Config, and GuardDuty needs approval.

### Blocking production launch

1. No completed production Cognito/MFA recovery drill or verified SES production sender.
2. CloudTrail and SNS alarm actions are defined but have not been provisioned,
   subscription-confirmed, or tested.
3. No tested Aurora/S3/Cognito recovery exercise.
4. The repository release gate and pnpm pin are defined, but Amplify `main`
   still needs production-only branch variables, protected/manual release
   settings, accepted build-spec ownership, and a custom domain before launch.
5. Public DNS still targets Wix and no Amplify domain association exists.
6. Dependency advisories listed below remain unresolved.

### Dependency and CDK advisories

The 2026-08-29 audit found these transitive production advisories:

- `sharp` below 0.35.0 through Next.js: high-severity inherited libvips
  advisories;
- `postcss` through Next.js: two high file-read/path-traversal advisories and
  two moderate follow-on/XSS advisories; patched targets now extend through
  8.5.23; and
- `nanoid` through Next.js/PostCSS: zero-size custom-generator denial of
  service, patched in 3.3.18.

The infrastructure production lockfile reports one high-severity
`brace-expansion` advisory through `aws-cdk-lib`. Do not run a breaking or
unreviewed automatic audit fix. Create
a separate dependency update branch, update Next.js/CDK within supported
compatible releases, review lockfile paths, run the full application and CDK
suite, synthesize, and inspect an account-aware diff.

CDK template validation warns that its local default-rule catalog does not list
Aurora PostgreSQL 16.14 even though the live regional service runs 16.14. Treat
this as stale validator metadata, not an engine downgrade request. Update the
CDK CLI/library in the dependency workstream and remove/acknowledge the warning
only after the validator recognizes the supported engine and the synthesized
database diff remains empty.

## Readiness recommendation

Continue development operation with the existing cost-conscious posture and
the approved private signature. Do not provision production yet. Repository
infrastructure is now synthesizable and isolated, but go-live still requires
owner approvals, runtime-login activation, SES/MFA readiness, confirmed alarm
delivery, recovery drills, Amplify branch isolation, cost attribution,
dependency remediation, and an approved DNS cutover.
