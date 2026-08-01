# Estimate Builder Handoff

## Phase 1 implementation

Phase 1 design and parity decisions are recorded in
[`docs/estimate-phase-1.md`](./estimate-phase-1.md). The Phase 1 migration adds the
organization-scoped customer, project, estimate, and ordered child-record foundation. The
protected application adds a minimal estimate list and atomic draft-creation flow.

Later phases must continue to treat the desktop application as the behavioral authority and must
resolve the ambiguities listed in the Phase 1 document before enabling issued estimates or
document generation.

The Cognito account foundation now expects organization/member context from `GET /v1/account`.
Chat 3 owns converting the existing Phase 1 estimate persistence to the approved AWS API and
Aurora architecture; this account conversion does not port or redesign estimate functionality.

## Authoritative desktop reference

The existing Perfect Shade Bid Generator is maintained at:

`C:\Users\sethb\Web Projects\Perfect Shade Tool`

That desktop application is an external reference project. It is not part of this website
repository and must not be copied into it. Before defining feature parity, calculation rules,
defaults, validation, or document-generation behavior, the estimator-conversion thread must
inspect the desktop project directly.

The desktop application must remain operational throughout the web conversion. The conversion
should proceed incrementally, with the desktop tool retained as the working fallback until the
web estimator has been validated and explicitly approved for replacement.

No estimate tables or estimate domain models were intentionally created during the
account-foundation phase.

## Required prerequisites

1. Chat 5 defines and, only when separately authorized, deploys the development Cognito/API
   outputs described in `docs/aws-backend-architecture.md`.
2. Bootstrap a verified Cognito staff identity and an active AWS database owner membership.
3. Confirm the role matrix (`owner`, `admin`, `staff`) with the business owner.
4. Inspect `C:\Users\sethb\Web Projects\Perfect Shade Tool` and obtain its schema,
   representative sanitized exports, and workflow documentation. None of those artifacts exists
   in this website repository.
5. Inventory desktop fields, calculations, statuses, document templates, and identifier rules.
6. Decide whether issued estimates are immutable and how revisions are represented.
7. Define customer/project duplicate handling and import reconciliation.
8. Approve retention, archival, and deletion rules.

## Integration contract

- Every customer, project, estimate, and child record must carry `organization_id`.
- Resolve Cognito `sub` to an active database membership in the API, then enforce tenant
  isolation with PostgreSQL RLS and test cross-organization denial.
- Customers belong to an organization; projects belong to a customer; estimates belong to a
  project. Denormalized organization IDs are recommended for direct RLS checks.
- Store `created_by`, `updated_by`, `created_at`, and `updated_at` on mutable records.
- Use the Cognito access token as bearer authentication to API Gateway. Lambda derives actor,
  organization, and role from validated claims plus the database membership; RLS and database
  constraints remain the final boundary.
- Customer-facing authentication remains out of scope. Do not add customers to staff
  memberships.
- Add indexes beginning with `organization_id` for account-scoped queries.

## Tests expected in the conversion

- An anonymous user cannot read or mutate operational data.
- A member cannot access another organization's rows even with guessed IDs.
- A disabled member loses access.
- Staff can perform approved operational actions but cannot manage memberships.
- Parent/child organization mismatches are rejected.
- Audit fields are populated consistently.

## Temporary compatibility boundary

The authoritative baseline still contains Supabase estimate actions, migrations, and
`lib/supabase/server.ts`. They are retained unchanged for Chat 3's behavioral reference and to
avoid crossing workstream ownership. Cognito is the active account provider, and
`lib/supabase/middleware.ts` is no longer referenced by `proxy.ts`.

The legacy estimate persistence is not a valid long-term mixed-provider path: a Cognito session
does not create a Supabase database identity. Chat 3 must replace estimate reads/RPC writes with
the AWS API, and Chat 4 should remove Supabase dependencies and compatibility artifacts only
after account and estimate parity gates pass.
