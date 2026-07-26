# Authentication Setup and Local Development

## Prerequisites

- Node.js 22.12 or newer
- pnpm
- A Supabase project for development

## Configure Supabase

1. Apply the migrations in filename order through the Supabase SQL editor or CLI:
   - `supabase/migrations/202607260001_account_foundation.sql`
   - `supabase/migrations/202607260002_estimate_phase_1.sql`
2. In Authentication settings, disable new-user public sign-ups.
3. Add `http://localhost:3000/auth/callback` to allowed redirect URLs.
4. Create and bootstrap the first owner as documented in `docs/account-architecture.md`.

Copy `.env.example` to `.env.local` and set:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

The publishable key may be labeled an `anon` key in older Supabase projects. Do not put the
Supabase service-role key in the application or AWS Amplify.

## Run and verify

```bash
pnpm install
pnpm test
pnpm lint
pnpm dev
```

Verify that an anonymous request to `/app` redirects to `/sign-in`, a staff user can sign in,
password recovery reaches `/reset-password`, and sign-out returns to `/sign-in`.

## AWS Amplify

Set all three variables in each Amplify environment. `NEXT_PUBLIC_SITE_URL` must match that
environment's canonical origin, without a trailing slash. Add its `/auth/callback` URL to
Supabase's redirect allow-list. Keep production and non-production Supabase projects separate
before real customer data is stored.
