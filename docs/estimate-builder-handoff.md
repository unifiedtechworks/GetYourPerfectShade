# Estimate Builder Handoff

## Phase 3 terms, notes, and preview

Phase 3 implementation and desktop-alignment decisions are recorded in
[`docs/estimate-phase-3.md`](./estimate-phase-3.md). It extends the protected editor and existing
estimate detail/update API with ordered terms and addenda, prevailing-wage behavior, lead time,
pricing validity, project notes, exact constant proposal sections, and a protected saved-draft
preview. Phase 4 now adds server-side DOCX/PDF/JSON output, recoverable S3
document history, explicit issue, revision, and duplication commands, and
protected lifecycle controls. Integration must apply `0007_estimate_phase_4.sql`
before enabling the new routes.

## Phase 2 draft editor

Phase 2 implementation and desktop differences are recorded in
[`docs/estimate-phase-2.md`](./estimate-phase-2.md). It adds the protected
`/app/estimates/[estimateId]` editor, exact live totals, authenticated estimate detail/update
API, optimistic concurrency, and controlled ordered-row replacement. Integration must deploy
the two API routes and apply `0005_estimate_phase_2.sql` before live use.

## Phase 1 AWS conversion

Phase 1 design and parity decisions are recorded in
[`docs/estimate-phase-1.md`](./estimate-phase-1.md). The AWS API contract is recorded in
[`docs/estimate-api.md`](./estimate-api.md). The Aurora migrations add the organization-scoped
account, customer, project, estimate, ordered child-record, idempotency, and audit-event
foundation. The protected application retains the minimal estimate list and atomic
draft-creation flow.

Later phases must continue to treat the desktop application as the behavioral authority and must
resolve the ambiguities listed in the Phase 1 document before enabling document generation.

The unprovisioned Supabase estimate RPC and migration were behavioral references only and are no
longer the active estimate persistence mechanism. Cognito supplies the authenticated staff
identity, while the AWS account and estimate APIs resolve organization membership in Aurora.

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

No estimate tables or estimate domain models were intentionally created during the original
account-foundation phase.

## Integration prerequisites

1. The integrated Cognito server-session resolver supplies a validated access token.
2. The Aurora account migration provides `app.organizations` and
   `app.organization_memberships` with Cognito `sub` stored as text.
3. CDK connects the account and estimate handlers to API Gateway through the shared RDS Data API
   adapter.
4. The controlled migration job applies all forward-only files through
   `infra/database/migrations/0007_estimate_phase_4.sql` in numeric filename order.
5. Development bootstrap creates one active Perfect Shade membership per staff identity.
6. Live authentication, tenant, role, rollback, and money-boundary gates run only after a
   separately authorized development deployment.

## Integration contract

- Every customer, project, estimate, and child record must carry `organization_id`.
- Enforce tenant isolation with explicit predicates plus forced RLS and test cross-organization
  denial.
- Customers belong to an organization; projects belong to a customer; estimates belong to a
  project. Denormalized organization IDs support direct RLS checks.
- Store `created_by`, `updated_by`, `created_at`, and `updated_at` on mutable records.
- API Gateway validates Cognito access tokens; Lambda ignores caller-supplied actor/organization
  identifiers and resolves membership in Aurora.
- Use explicit Data API transactions for tenant queries and mutations, establishing controlled
  transaction-local context before tenant SQL.
- Customer-facing authentication remains out of scope. Do not add customers to staff
  memberships.
- Add indexes beginning with `organization_id` for account-scoped queries.

## Tests expected in the conversion

- Anonymous and invalid-token users cannot reach account or estimate handlers.
- A member cannot access another organization's rows even with guessed IDs.
- A disabled member loses access.
- Staff can perform approved operational actions but cannot manage memberships.
- Parent/child organization mismatches are rejected.
- Audit fields and append-only business audit events are populated consistently.
- Forced failures roll back customer, project, estimate, pricing, idempotency, and audit writes.
- Idempotent retries return one draft.

## Provider boundary

Estimate routes use the same validated Cognito session as the account area and pass only its
access token to the AWS API. No active account or estimate path uses Supabase authentication or
persistence. Historical Supabase behavior remains available in Git history rather than runtime
code or deployable migrations.
