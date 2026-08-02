# Authentication Setup and Local Development

## Prerequisites

- Node.js 22.12 or newer
- pnpm
- Chat 5's deployed development Cognito User Pool and API outputs for live integration testing

The application builds and its unit tests run before AWS resources exist. Protected routes fail
closed until Cognito configuration is present. No live AWS validation is implied by mock tests.

## Environment contract

Copy `.env.example` to `.env.local` and populate Chat 5's non-secret development outputs:

```dotenv
NEXT_PUBLIC_AWS_REGION=us-west-2
NEXT_PUBLIC_COGNITO_USER_POOL_ID=us-west-2_example
NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID=example
NEXT_PUBLIC_API_BASE_URL=https://example.execute-api.us-west-2.amazonaws.com
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

- Region, pool ID, client ID, API URL, and site URL are non-secret identifiers.
- The Cognito app client must have no client secret and must allow `USER_PASSWORD_AUTH` and
  `REFRESH_TOKEN_AUTH`.
- Public sign-up must be disabled. Administrators create and verify staff email identities.
- Never add AWS access keys, Cognito tokens, passwords, reset codes, database credentials,
  secret ARNs, or private account identifiers to environment files or source control.
- AWS workloads use IAM roles; local infrastructure operators use approved short-lived AWS
  credentials. The web application itself does not need AWS credentials for these public Cognito
  flows.

`NEXT_PUBLIC_API_BASE_URL` may be omitted before the API exists. A valid Cognito user can then
display identity information, but no organization membership is assumed and organization-bound
routes remain unavailable.

## Local verification

```bash
pnpm install
pnpm test
pnpm lint
pnpm build
pnpm dev
```

Validate the infrastructure from a clean dependency install without AWS credentials:

```bash
cd infra
npm ci
npm run build
npm test
npm run synth
```

CDK bundles the stable application-owned handlers under `backend/runtime/`. Synthesis is
lookup-free and does not deploy resources.

Without AWS resources, verify `/app` redirects to `/sign-in?error=configuration` and public
routes remain available. With the development stack deployed, additionally verify:

1. Unknown credentials receive the generic sign-in error.
2. An administrator-created user sets a permanent password.
3. A verified staff user signs in and sees identity/account data.
4. Forgot password sends a code without disclosing whether other usernames exist.
5. A valid code resets the password.
6. Sign-out clears cookies and attempts Cognito global sign-out.
7. Expired access tokens refresh only in server-controlled code.
8. Disabled users and missing memberships fail closed.

## AWS Amplify

Set the five environment values per Amplify branch/environment. Development and production must
use separate Cognito and API resources. Production is not authorized by this application change.
Use an approved SES sender before production invitations or password recovery.

## Database migration order

After a separately authorized development deployment creates Aurora, the controlled migration
identity applies these files in order:

1. `infra/database/migrations/0001_account_foundation.sql`
2. `infra/database/migrations/0002_estimate_phase_1.sql`

Ordinary Lambda cold starts, Amplify builds, and CDK synthesis never apply migrations. The
application contains no active Supabase runtime, environment variable, package, or migration
path; historical behavior remains available in Git history.
