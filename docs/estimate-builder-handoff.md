# Estimate Builder Handoff

## Phase 1 implementation

Phase 1 design and parity decisions are recorded in
[`docs/estimate-phase-1.md`](./estimate-phase-1.md). The Phase 1 migration adds the
organization-scoped customer, project, estimate, and ordered child-record foundation. The
protected application adds a minimal estimate list and atomic draft-creation flow.

Later phases must continue to treat the desktop application as the behavioral authority and must
resolve the ambiguities listed in the Phase 1 document before enabling issued estimates or
document generation.

The account foundation is ready for estimate-domain design once the prerequisites below are met.
The current pass deliberately contains no customer, project, estimate, pricing, document, or
billing implementation.

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

1. Apply and verify the account migration in development.
2. Bootstrap the Perfect Shade organization and owner.
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
- Enforce tenant isolation with RLS and test cross-organization denial.
- Customers belong to an organization; projects belong to a customer; estimates belong to a
  project. Denormalized organization IDs are recommended for direct RLS checks.
- Store `created_by`, `updated_by`, `created_at`, and `updated_at` on mutable records.
- Use authenticated server actions or route handlers for mutations, but treat RLS and database
  constraints as the final boundary.
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
