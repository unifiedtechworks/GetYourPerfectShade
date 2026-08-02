# Perfect Shade AWS Infrastructure

This package defines the AWS-native **development** backend foundation described in
[`docs/aws-backend-architecture.md`](../docs/aws-backend-architecture.md). It does not contain
application authentication flows or estimate business logic.

## Structure

```text
infra/
  bin/perfect-shade.ts                 CDK entry point
  lib/config.ts                        development-only context contract
  lib/perfect-shade-development-stack.ts
  lib/constructs/
    identity.ts                        Cognito User Pool and app client
    data.ts                            private Aurora Serverless v2 and Data API
    storage.ts                         private versioned document bucket
    api.ts                             HTTP API, JWT authorizer, application Lambdas
    observability.ts                   logs, alarms, dashboard, optional budget
  ../backend/runtime/                  stable account and estimate Lambda entry points
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
| `auroraEngineVersion` | `16.6` | Deployable Aurora PostgreSQL engine version; verify region availability first |
| `auroraMinCapacity` | `0` | Development scale-to-zero minimum |
| `auroraMaxCapacity` | `1` | Conservative development maximum |
| `auroraAutoPauseMinutes` | `15` | Idle interval before pause |
| `mfaMode` | `off` | May later be changed to `optional` without redesigning constructs |
| `sesFromEmail` | unset | Verified SES sender email; requires `sesVerifiedDomain` |
| `sesVerifiedDomain` | unset | Verified SES domain |
| `enableBudget` | `false` | Budget resources are opt-in |
| `monthlyBudgetUsd` | `50` | Suggested small-development starting value, not approved for deployment |
| `budgetNotificationEmail` | unset | Required before `enableBudget=true` |

Example synth with non-secret overrides:

```powershell
npm run synth -- --context callbackUrls=https://dev.example.com/auth/callback `
  --context logoutUrls=https://dev.example.com/sign-in `
  --context allowedCorsOrigins=https://dev.example.com
```

Do not store an account ID, AWS credentials, passwords, tokens, customer data, or unapproved
notification email in `cdk.json`.

## Application handler ownership

- `GET /v1/account` bundles `backend/runtime/account-handler.ts`.
- `GET /v1/estimates` and `POST /v1/estimates/drafts` bundle
  `backend/runtime/estimate-handler.ts`.
- Both entry points use the shared RDS Data API adapter. Account and estimate business logic stays
  under `backend/`; CDK supplies environment values, IAM grants, and route integration only.

See [`docs/aws-development-infrastructure.md`](../docs/aws-development-infrastructure.md) for
bootstrap, deployment, outputs, migrations, rollback, teardown, cost, and production guidance.
