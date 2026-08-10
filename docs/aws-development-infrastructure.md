# AWS Development Infrastructure Runbook

This runbook covers the CDK foundation under `infra/`. It is development-only. It does not
authorize AWS provisioning, production deployment, user creation, or application conversion.

## Amplify Hosting boundary

AWS Amplify Hosting remains the required host for the public and protected Next.js application.
The authoritative baseline contains no checked-in Amplify app/branch definition, app ID, build
specification, or approved repository-connection configuration. This backend stack therefore does
not create, replace, or import an Amplify Hosting application by assumption.

Before runtime integration, Chat 4 must confirm the existing Unified Techworks Amplify app and
development branch, then map this stack's non-secret outputs into that branch's environment
configuration. If hosting infrastructure is later brought under CDK, import or model the
confirmed Amplify resources in a separately reviewed change so the live public website is not
duplicated or replaced accidentally.

## Defined resources

The `PerfectShadeDevelopment` stack defines:

- A staff-only Cognito User Pool with public signup disabled, email sign-in, verified-email
  recovery, a no-secret Next.js app client, and configurable callbacks/logout URLs.
- A NAT-free VPC with isolated subnets and no public database route.
- An encrypted Aurora PostgreSQL Serverless v2 writer with Data API enabled, a generated Secrets
  Manager credential, a one-day development backup, 0–1 ACU scaling, and 15-minute auto-pause.
- A private, encrypted, versioned S3 document bucket with blocked public access and development
  cleanup rules.
- An API Gateway HTTP API with Cognito JWT authorization and protected account and estimate
  routes wired to stable application-owned handlers.
- Two bundled ARM64 Node.js Lambdas with JSON logging. They share the constrained RDS Data API
  adapter; only the estimate Lambda has document-bucket read/upload access, with no object-delete
  grant.
- One-week development log retention, Lambda/API/Aurora alarms, and an operations dashboard.
- Optional, context-gated AWS Budget alerts. No budget or email subscription exists by default.
- Five non-secret SSM parameters and CloudFormation outputs for application integration.

CDK bundles `backend/runtime/account-handler.ts` and
`backend/runtime/estimate-handler.ts`; it does not duplicate account or estimate business logic.

## Prerequisites and provisioning gate

Before any `cdk bootstrap`, `cdk diff`, or `cdk deploy` that uses AWS:

1. The owner identifies the approved AWS CLI profile for the existing Unified Techworks account.
2. Verify the profile resolves to the owner-approved account without copying the account ID into
   repository files.
3. Confirm `us-west-2`.
4. Check whether that account/region is already CDK-bootstrapped.
5. Confirm the callback, logout, and CORS origins for the development application.
6. Confirm whether Cognito's development sender is acceptable or provide a verified Perfect
   Shade/Unified Techworks SES identity.
7. Approve a monthly development budget value, alert thresholds, and notification email before
   enabling the budget construct.
8. Explicitly approve creation of billable development resources.
9. Confirm the existing Amplify app/branch that will consume the development outputs.

This task supplies none of those approvals and performs no deployment.

The committed URL defaults are localhost-only. No Amplify URL or custom development domain is
assumed to exist. Supply the future hosted origin through CDK context after it is confirmed.

## AWS CLI and CDK bootstrap

Use a named, short-lived profile approved for this project. Do not use static credentials in
`.env` files.

```powershell
$env:AWS_PROFILE = '<approved-profile>'
$env:AWS_REGION = 'us-west-2'
aws sts get-caller-identity
aws cloudformation describe-stacks --stack-name CDKToolkit --region us-west-2
```

If `CDKToolkit` does not exist, bootstrap only after approval:

```powershell
cd infra
npx cdk bootstrap "aws://<approved-account-id>/us-west-2" `
  --profile '<approved-profile>'
```

Bootstrap modifies the AWS account and can create billable storage; it is not a read-only
validation step.

## Local install and validation

```powershell
pnpm install --frozen-lockfile
cd infra
npm ci
npm run build
npm test
npm run synth
```

The synthesized template is written below `infra/cdk.out/` and must not be committed. Synthesis
does not look up or create AWS resources.

## Development diff and deployment

Only after every provisioning gate is satisfied:

```powershell
cd infra
npm run diff -- --profile '<approved-profile>' `
  --no-change-set `
  --context callbackUrls='http://localhost:3000/auth/callback,https://<approved-development-host>/auth/callback' `
  --context logoutUrls='http://localhost:3000/sign-in,https://<approved-development-host>/sign-in' `
  --context allowedCorsOrigins='http://localhost:3000,https://<approved-development-host>'
```

To configure a verified SES identity, add:

```text
--context emailSenderMode='ses'
--context sesFromEmail='<verified-sender>'
--context sesVerifiedDomain='<verified-domain>'
```

To opt into budget alerts only after approving the amount and recipient, add:

```text
--context enableBudget=true
--context monthlyBudgetUsd='<approved-usd-value>'
--context budgetNotificationEmail='<approved-recipient>'
```

After reviewing the diff, deployment would use the same context values:

```powershell
npx cdk deploy PerfectShadeDevelopment --profile '<approved-profile>' `
  --context perfectShadeEnvironment=development `
  --context auroraEngineVersion=16.14 `
  --context callbackUrls='http://localhost:3000/auth/callback,https://<approved-development-host>/auth/callback' `
  --context logoutUrls='http://localhost:3000/sign-in,https://<approved-development-host>/sign-in' `
  --context allowedCorsOrigins='http://localhost:3000,https://<approved-development-host>'
```

Never deploy this development stack with production data or secrets.

## Stack outputs and application mapping

| Stack output | Application configuration | Sensitivity |
| --- | --- | --- |
| `AwsRegion` | `NEXT_PUBLIC_AWS_REGION` | Public identifier |
| `ApiUrl` | `NEXT_PUBLIC_API_BASE_URL` | Public endpoint |
| `CognitoUserPoolId` | `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | Public identifier |
| `CognitoUserPoolClientId` | `NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID` | Public app-client identifier |
| `CognitoHostedUiDomain` | Cognito authorization/logout endpoint construction | Public identifier |
| `CognitoIssuer` | Server/API token validation configuration | Public identifier |
| `AuroraClusterArn` | Lambda/CDK integration only | Server-side configuration |
| `AuroraSecretArn` | Lambda/migration role reference only | Sensitive reference; never client-side |
| `AuroraDatabaseName` | Migration/Lambda configuration | Server-side configuration |
| `DocumentBucketName` | Lambda/CDK integration only | Server-side configuration |
| `SesSenderStatus` | Deployment readiness check | Non-secret status |
| `BudgetStatus` | Deployment readiness check | Non-secret status |

Equivalent non-secret values are published under `/perfect-shade/development/` in Parameter
Store. Secrets Manager owns the generated database password. Do not copy the password into
Amplify variables, local files, logs, or client code.

## Cognito and SES

The User Pool permits only administrator-created staff accounts. This infrastructure task does
not create users. The default synthesized configuration uses Cognito's development sender because
no verified SES identity was provided. Before production—and preferably before invitation-flow
validation—verify an approved SES domain/email in `us-west-2` and pass the documented context.

MFA defaults to off because it is deferred. The construct accepts `mfaMode=optional` so TOTP can
be introduced later without replacing the identity architecture. Chat 2 owns the application
challenge/enrollment flows.

## Aurora migrations

CDK creates the cluster but does not apply application schema. Forward-only migrations are
deterministic and must be applied in this order:

1. `infra/database/migrations/0001_account_foundation.sql`
2. `infra/database/migrations/0002_estimate_phase_1.sql`
3. `infra/database/migrations/0003_initial_owner_bootstrap.sql`
4. `infra/database/migrations/0004_staff_account_management.sql`
5. `infra/database/migrations/0005_estimate_phase_2.sql`
6. `infra/database/migrations/0006_estimate_phase_3.sql`
7. `infra/database/migrations/0007_estimate_phase_4.sql`

A controlled RDS Data API runner is implemented under `infra/database/runner`. It uses an
approved administrative migration identity—not the normal Lambda runtime role—and exposes:

```powershell
pnpm migration:status
pnpm migration:plan
pnpm migration:apply
```

The runner applies migrations explicitly after the cluster is healthy, records immutable
filename/version/SHA-256 history, and refuses changed applied files or invalid history. Every
migration and its history insert share one transaction, with rollback and stop-on-first-failure
behavior. See [`docs/aurora-migration-runner.md`](./aurora-migration-runner.md) for inputs,
placeholder invocation, failure recovery, and production controls.

After apply, run tenant-isolation and rollback verification before application traffic.

Do not run migrations from Lambda cold starts, the Amplify build, or CDK constructors.

The initial staff owner is created only after all migrations are applied, using the controlled
command and recovery procedure in
[`initial-owner-bootstrap.md`](./initial-owner-bootstrap.md). CDK synthesis and deployment do not
create Cognito users or account rows.

The complete authorized development activation sequence—deployment, outputs, migration
status/plan/apply, owner bootstrap, permanent-password completion, application configuration,
and live validation—is numbered in
[`aurora-migration-runner.md`](./aurora-migration-runner.md#initial-development-sequence). None of
those live steps has been performed by repository integration or verification.

## Rollback and teardown

CloudFormation rollback handles failed stack updates. For a successful but defective update,
prefer a corrected forward deployment; database schema rollback requires a separately reviewed
migration strategy.

The development stack deliberately permits destruction:

- Aurora deletion protection is off and removal policy is `DESTROY`.
- The development database secret is removed with the cluster.
- The document bucket uses `autoDeleteObjects` and `DESTROY`.
- Development log groups are removed.

These settings can permanently erase development data. Teardown requires explicit approval and
an exact stack/profile/region check:

```powershell
npx cdk destroy PerfectShadeDevelopment --profile '<approved-profile>'
```

Production must use deletion protection, retained/final database snapshots, longer backups and
PITR, non-destructive S3 policies, approved retention, and tested restore procedures. Never reuse
the development removal settings for production.

## Cost considerations

Aurora is the primary development cost risk even with a 0 ACU minimum. Auto-pause removes active
instance-capacity charges while paused, but storage, backups, Secrets Manager, logs, S3 versions,
and other service usage can still incur charges. The first database request after pausing can be
slower while Aurora resumes. API Gateway, Lambda, Cognito, and S3 remain usage-priced. The design
has no NAT Gateway, avoiding a common fixed networking charge.

The committed optional budget example uses USD 50 only as a documentation starting point. It is
disabled and is not owner approval. Creating a budget does not cap or stop AWS spend; it sends
notifications at configured thresholds.

## Preview behavior

Amplify preview deployments use the shared isolated development backend with preview-specific
callback/CORS configuration and synthetic test tenants. They do not create permanent Aurora
clusters and never receive production secrets or customer data.

## Supabase disposition

No Supabase resources ever existed, so no external cleanup is required. The integrated source has
no Supabase client, middleware, dependency, environment variable, or deployable migration. The
former prototype remains available in Git history; its tenant, financial, and transaction rules
are preserved by the AWS documentation, tests, and ordered Aurora migrations.

## Production differences

Production is a separate future stack/configuration and is not provisioned here. It requires
separate Cognito, API, Aurora, S3, secrets, names, tags, budgets, backups, configuration, and data;
deletion protection; PITR; retained/final snapshots; approved log/document retention; verified
SES; documented restore procedures; and an explicit production launch authorization.
