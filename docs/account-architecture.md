# Account Architecture

## Decision summary

Perfect Shade is modeled as one organization with one or more internal staff users. A user has
an authentication identity and a profile; access to company data comes from an active
organization membership. This keeps the first release conservative while allowing another
employee to be added without replacing the model.

Public self-registration is intentionally excluded. The application is an internal business
tool, so an administrator creates or invites staff in Supabase. Customer-facing accounts are
also excluded. If a customer portal is approved later, it should use a separate customer-access
model rather than making customers staff organization members.

## Routes and enforcement

| Area | Routes | Enforcement |
| --- | --- | --- |
| Public marketing | Existing `/`, `/about`, `/contact`, `/gallery/*` | Public |
| Authentication | `/sign-in`, `/forgot-password`, `/reset-password`, `/auth/callback` | Public, with authenticated users redirected away from sign-in |
| Staff application | `/app`, `/app/account` | Middleware session check plus server-side `getUser()` |

The existing public route tree was not moved into a route group. Moving it would create needless
conflicts with the public-site work. `SiteChrome` only suppresses the existing marketing
header/footer for authentication and application paths.

## Authentication and persistence

- Supabase Auth provides email/password authentication, secure cookie-backed SSR sessions,
  password recovery, and administrative invitation/provisioning.
- Supabase Postgres stores profiles, organizations, and memberships.
- Row-level security (RLS) is the primary data boundary. Application route checks improve UX
  but are not the authorization boundary.
- AWS Amplify Hosting remains the web host. No server-local persistence or long-lived process is
  required.

## Authorization

Roles are intentionally small:

- `owner`: full organization administration, including staff membership.
- `admin`: organization and staff administration; intended to have full operational data access.
- `staff`: operational access to customers, projects, and estimates, but not staff or company
  administration.

For the future operational tables, all active members may view customers, projects, and
estimates in their organization. Owners, admins, and staff may create and edit them. Only owners
and admins may manage memberships or organization settings. Delete permission should be
restricted to owners/admins or replaced with archival after workflow requirements are known.

Every account-owned row must contain `organization_id`. RLS policies must derive allowed
organization IDs from the signed-in user's active memberships. Client-supplied organization IDs
must never be trusted without RLS validation.

## Data model

Account foundation:

- `profiles`: one row per Supabase Auth user.
- `organizations`: company/workspace ownership boundary.
- `organization_memberships`: user-to-organization role and status.

Estimate Phase 1:

```text
organization
  └─ customer
       └─ project
            └─ estimate
                 └─ scope, pricing, terms, addenda, future revisions/documents
```

Estimates now have ordered scope, base/alternate pricing, additional-term, and addenda records.
These operational tables contain `organization_id`, authorship, and timestamp fields. Composite
foreign keys keep parent and child rows in the same organization. Revision and issued-estimate
immutability remain future decisions documented in `docs/estimate-phase-1.md`.

## Environment strategy

Use separate Supabase projects for production and non-production data. A shared development
project may serve local and preview environments initially, provided it contains no production
customer data. AWS Amplify environment variables are configured per branch/environment.
Production redirect URLs must be allow-listed exactly in Supabase Auth. Preview wildcard
redirects may be enabled only for the known Amplify preview domain.

No service-role key belongs in this web application. Administrative user creation and initial
bootstrap happen through the Supabase dashboard/SQL editor. Only the publishable browser key is
used by Next.js; RLS protects database access.

## Initial owner bootstrap

1. Apply `supabase/migrations/202607260001_account_foundation.sql`.
2. Disable public sign-ups in Supabase Auth.
3. Create the first staff user in Supabase Authentication.
4. In the SQL editor, replace the UUID below with that auth user ID and run:

```sql
begin;
with new_org as (
  insert into public.organizations (name, created_by, updated_by)
  values ('Perfect Shade', '<USER_UUID>', '<USER_UUID>')
  returning id
)
insert into public.organization_memberships
  (organization_id, user_id, role, status, created_by, updated_by)
select id, '<USER_UUID>', 'owner', 'active', '<USER_UUID>', '<USER_UUID>'
from new_org;
commit;
```

Subsequent staff invitation UI is deferred. Until it exists, create users and memberships
administratively.

## Security notes and limitations

- Middleware fails closed for `/app` when configuration is absent.
- Server layouts revalidate the user with Supabase Auth instead of trusting cookie contents.
- Password recovery returns the same visible result regardless of whether an email exists.
- Open redirects are rejected.
- MFA, rate-limit customization, email template branding, staff invitation UI, membership
  editing, and audit-event history are deferred.
- The current audit fields record row authorship and timestamps. A separate append-only audit
  event table should be added when estimate workflow events are defined.
