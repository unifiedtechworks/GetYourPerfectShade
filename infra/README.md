# Perfect Shade AWS Infrastructure

This package defines the AWS-native development backend and a separately guarded,
not-yet-authorized production design described in
[`docs/aws-backend-architecture.md`](../docs/aws-backend-architecture.md). It does not contain
application authentication flows or estimate business logic.

## Structure

```text
infra/
  bin/perfect-shade.ts                 CDK entry point
  lib/config.ts                        shared/development context contract
  lib/production-config.ts             guarded production context contract
  lib/perfect-shade-development-stack.ts
  lib/perfect-shade-production-stack.ts
  lib/constructs/
    identity.ts                        Cognito User Pool and app client
    production-recovery-operator.ts    Opt-in, pool-scoped recovery IAM role
    data.ts                            private Aurora Serverless v2 and Data API
    runtime-database-credentials.ts   shared restricted login secret/provisioner
    storage.ts                         private versioned document bucket
    api.ts                             HTTP API, JWT authorizer, application Lambdas
    observability.ts                   logs, alarms, dashboard, optional budget
  ../backend/runtime/                  stable account and estimate Lambda entry points
  database/runner/                    controlled RDS Data API migration CLI
  database/migrations/                forward-only PostgreSQL migrations
  test/                                CDK assertion tests
```

The constructs are kept in one stack to avoid unnecessary cross-stack exports and deployment
ordering. Their public properties are the stable wiring interface for later handler integration.

## Local verification

```powershell
pnpm install --frozen-lockfile
cd infra
npm ci
npm run build
npm test
npm run synth
```

Synthesis is lookup-free and does not require AWS credentials. The CDK app fixes the approved
region but leaves the account unresolved until a separately authorized deployment selects an
approved AWS CLI profile. Synthesis creates `infra/cdk.out/`, which is ignored by Git.

## Context contract

The committed defaults are development-only and use `us-west-2`:

| Context key | Default | Purpose |
| --- | --- | --- |
| `perfectShadeEnvironment` | `development` | Guardrail; any other value fails synthesis |
| `callbackUrls` | `http://localhost:3000/auth/callback` | Comma-separated Cognito callbacks |
| `logoutUrls` | `http://localhost:3000/sign-in` | Comma-separated Cognito logout URLs |
| `allowedCorsOrigins` | `http://localhost:3000` | Comma-separated HTTP API origins |
| `auroraEngineVersion` | `16.14` | Supported Aurora PostgreSQL engine version verified in `us-west-2` |
| `auroraMinCapacity` | `0` | Development scale-to-zero minimum |
| `auroraMaxCapacity` | `1` | Conservative development maximum |
| `auroraAutoPauseMinutes` | `15` | Idle interval before pause |
| `mfaMode` | `off` | May later be changed to `optional` without redesigning constructs |
| `emailSenderMode` | `cognito` | Development sender; set to `ses` only with an approved verified identity |
| `sesFromEmail` | unset | Verified SES sender email; required with `sesVerifiedDomain` when mode is `ses` |
| `sesReplyToEmail` | unset | Monitored Reply-To; production requires this separately from the send-only From address |
| `sesVerifiedDomain` | unset | Verified SES domain |
| `enableBudget` | `false` | Budget resources are opt-in and require an approved recipient |
| `monthlyBudgetUsd` | `50` | Suggested small-development starting value, not approved for deployment |
| `budgetNotificationEmail` | unset | Required before `enableBudget=true` |
| `estimateIncludeCompanySignature` | `true` | Backend-only generated DOCX/PDF signature toggle; production must pass an explicit reviewed value |

Example synth with non-secret overrides:

```powershell
npm run synth -- --context callbackUrls=http://localhost:3000/auth/callback,https://<approved-development-host>/auth/callback `
  --context logoutUrls=http://localhost:3000/sign-in,https://<approved-development-host>/sign-in `
  --context allowedCorsOrigins=http://localhost:3000,https://<approved-development-host>
```

The local URLs are safe committed defaults. No hosted development domain is assumed. Add the
future Amplify URL or approved custom domain through these comma-separated context values.

AWS RDS currently lists Aurora PostgreSQL 16.14 as available in `us-west-2`. The CloudFormation
validation schema bundled with `aws-cdk-lib` 2.268.0 recognizes that engine version, so synthesis
no longer emits the earlier validator warning. Reconfirm regional availability immediately before
deployment because regional service availability remains an operational prerequisite.

## Dependency advisory

`aws-cdk-lib` 2.268.0 bundles the patched `brace-expansion` 5.0.9 release, resolving
GHSA-rgw5-rvv9-x895 without a package override. CDK and its validation dependencies remain local
build, synthesis, diff, and deployment tooling; they are not included in the Next.js application
or Lambda runtime bundles. Continue to use only trusted infrastructure inputs and review future
CDK upgrades with synthesis and account-aware diff checks.

Do not store an account ID, AWS credentials, passwords, tokens, customer data, or unapproved
notification email in `cdk.json`.

## Production synthesis (no deployment authority)

Production has no committed recipient or domain defaults. Use review-only placeholder values
for credential-disabled synthesis; real approved values must be supplied only at the separately
authorized deployment review:

```powershell
npm run synth -- PerfectShadeProduction `
  --context perfectShadeEnvironment=production `
  --context confirmProductionSynthesis=true `
  --context callbackUrls=https://www.getyourperfectshade.com/auth/callback `
  --context logoutUrls=https://www.getyourperfectshade.com/sign-in `
  --context allowedCorsOrigins=https://www.getyourperfectshade.com `
  --context sesFromEmail=no-reply@example.invalid `
  --context sesReplyToEmail=reply-to@example.invalid `
  --context sesVerifiedDomain=example.invalid `
  --context operationsNotificationEmail=operations@example.invalid `
  --context budgetNotificationEmail=budget@example.invalid `
  --context costAnomalyNotificationEmail=cost@example.invalid `
  --context estimateIncludeCompanySignature=true
```

This produces `PerfectShadeProduction` only. It does not include or update
`PerfectShadeDevelopment`. Never run `cdk deploy` or `cdk bootstrap` from this example.

Production settings are intentionally fixed or guarded: PostgreSQL 16.14, 0.5–4 ACU, no
auto-pause, 35-day backup retention, deletion protection, retained secrets/buckets, required
TOTP MFA, SES sender mode, and a USD 200 budget definition. `cloudTrailDataEventsEnabled=true`
is optional because S3 object-level events can materially increase CloudTrail cost.

The production SES domain identity is a pre-existing, externally managed prerequisite.
`PerfectShadeProduction` imports `sesVerifiedDomain` by name and uses the resulting
account- and region-aware identity ARN for Cognito email; it does not create, update, or delete
the SES identity or its Route 53 Easy DKIM records. Confirm identity verification, DKIM, and SES
production sending access in `us-west-2` before deployment.

The recovery role is intentionally absent by default. `recoveryOperatorPrincipalArn` must be one
exact IAM user or role ARN and must remain unset until the primary/backup operators and their MFA
trust model are approved. Supplying it creates the pool-scoped
`perfect-shade-production-cognito-recovery` role; it does not grant the public application or
application Lambdas recovery access. See
[`docs/production-email-mfa.md`](../docs/production-email-mfa.md) before synthesizing or deploying
that optional path.

The production runtime secret is distinct from the admin/migration secret. The same shared
credential construct used by development transactionally synchronizes the restricted
`perfect_shade_app_runtime` login and gates application Lambda updates. Application Lambdas
never receive the admin secret. Rotation remains a separately reviewed operation. See
[`docs/aws-production-readiness.md`](../docs/aws-production-readiness.md).

The root [`amplify.yml`](../amplify.yml) pins pnpm and runs
`pnpm validate:amplify-environment`. Amplify `main` fails unless branch-specific production
values include `PERFECT_SHADE_DEPLOYMENT_ENVIRONMENT=production` and the release-time
`PERFECT_SHADE_PRODUCTION_RELEASE_APPROVED=true` marker. Production-only expected-value
overrides for the API URL, user-pool ID, and client ID must exactly match their public values,
so app-level development values cannot pass accidentally. Remove the release marker after the
approved job. The current development values must not remain as app-level defaults when
production hosting is enabled.

## Recovery access is a separate opt-in app

`bin/recovery-access.ts` defines `PerfectShadeRecoveryAccess` independently of either backend.
It has one pool-scoped `PerfectShadeProductionRecovery` Identity Center permission set (PT1H),
no broad managed policies, and no assignments by default. Its assignment activation requires
two distinct reviewed USER IDs in the default mode. The separately guarded `protected-emergency`
mode permits one primary only after current IAM state and real MFA/role-use/revocation events verify.
Approval strings alone do not activate it. MFA enforcement/custody still need actual manual review.
Never deploy the main production stack merely to configure operator access. See
[`docs/identity-center-recovery-access.md`](../docs/identity-center-recovery-access.md).

`bin/recovery-drill.ts` is a separate guarded disposable Cognito-only app, with no automatic users
and no existing-pool references. Synthesis is not billable-resource approval. See
[`docs/recovery-drill.md`](../docs/recovery-drill.md). Neither entrypoint is invoked by the existing
`cdk.json` development/production app; backend synthesis behavior remains unchanged.

`bin/emergency-recovery.ts` is a third independent app, empty by default. Its explicitly enabled
definition creates a console-password-free/key-free IAM user and exact-principal, fresh-MFA,
one-hour Cognito recovery role with restrictive boundaries. Optional local-only CLI authentication
and existing-trail/SNS alerts need separate guarded inputs and approvals. See
[`docs/protected-emergency-aws-access.md`](../docs/protected-emergency-aws-access.md); never deploy
the production backend merely to configure emergency access.

## Production notification repair is not a backend deployment

The operations topic's CloudWatch publishing grant is defined on its existing CDK-managed policy.
Never deploy pending Cognito changes to repair notifications. The offline
`bin/prepare-operations-alert-maintenance.ts` prepares a reviewed deployed-template-only,
two-stage subscription repair without AWS calls. It does not authorize change sets, subscriptions,
policy updates or test messages. See
[`docs/production-operations-alert-readiness.md`](../docs/production-operations-alert-readiness.md)
for ownership, exact scope, confirmation/testing and rollback gates.

## Application handler ownership

- `GET /v1/account`, the protected `/v1/account/team*` administration routes, and
  `POST /v1/account/profile` bundle `backend/runtime/account-handler.ts`.
- `GET /v1/estimates` and `POST /v1/estimates/drafts` bundle
  `backend/runtime/estimate-handler.ts`.
- Both entry points use the shared RDS Data API adapter. Account and estimate business logic stays
  under `backend/`; CDK supplies environment values, IAM grants, and route integration only.

See [`docs/aws-development-infrastructure.md`](../docs/aws-development-infrastructure.md) for
bootstrap, deployment, outputs, migrations, rollback, teardown, cost, and production guidance.
See [`docs/aurora-migration-runner.md`](../docs/aurora-migration-runner.md) for the
`status`, `plan`, and `apply` operator commands and immutable checksum history.
See [`docs/initial-owner-bootstrap.md`](../docs/initial-owner-bootstrap.md) for the controlled
first-owner command, migration `0003` prerequisite, and Cognito-only partial-failure recovery.
