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
| `sesVerifiedDomain` | unset | Verified SES domain |
| `enableBudget` | `false` | Budget resources are opt-in and require an approved recipient |
| `monthlyBudgetUsd` | `50` | Suggested small-development starting value, not approved for deployment |
| `budgetNotificationEmail` | unset | Required before `enableBudget=true` |

Example synth with non-secret overrides:

```powershell
npm run synth -- --context callbackUrls=http://localhost:3000/auth/callback,https://<approved-development-host>/auth/callback `
  --context logoutUrls=http://localhost:3000/sign-in,https://<approved-development-host>/sign-in `
  --context allowedCorsOrigins=http://localhost:3000,https://<approved-development-host>
```

The local URLs are safe committed defaults. No hosted development domain is assumed. Add the
future Amplify URL or approved custom domain through these comma-separated context values.

AWS RDS currently lists Aurora PostgreSQL 16.14 as available in `us-west-2`. The CloudFormation
validation schema bundled with `aws-cdk-lib` 2.263.0 predates that release and emits a synthesis
warning even though the generated template correctly requests 16.14. Reconfirm regional
availability immediately before deployment and remove this note after CDK's schema catches up.

## Dependency advisory

`npm audit` currently reports GHSA-rgw5-rvv9-x895 in `brace-expansion` 5.0.8. The affected copy
is bundled by `aws-cdk-lib` 2.263.0 through its bundled `minimatch` dependency. It is used by
local CDK build/synthesis tooling and is not included in the Next.js application or Lambda
runtime bundles. The patched `brace-expansion` release is 5.0.9, but 2.263.0 is currently the
latest compatible `aws-cdk-lib` release and npm cannot override or repair its bundled copy.
Do not use untrusted glob patterns in infrastructure tooling; upgrade CDK when an upstream
release includes the patched bundle.

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
  --context sesVerifiedDomain=example.invalid `
  --context operationsNotificationEmail=operations@example.invalid `
  --context budgetNotificationEmail=budget@example.invalid
```

This produces `PerfectShadeProduction` only. It does not include or update
`PerfectShadeDevelopment`. Never run `cdk deploy` or `cdk bootstrap` from this example.

Production settings are intentionally fixed or guarded: PostgreSQL 16.14, 0.5–4 ACU, no
auto-pause, 35-day backup retention, deletion protection, retained secrets/buckets, required
TOTP MFA, SES sender mode, and a USD 200 budget definition. `cloudTrailDataEventsEnabled=true`
is optional because S3 object-level events can materially increase CloudTrail cost.

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
