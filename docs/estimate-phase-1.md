# Web Estimate Builder Phase 1

## Purpose and authority

This document records the desktop-to-web parity inventory, Phase 1 domain and persistence
decisions, calculation specification, and follow-on plan. Phase 1 now uses the approved
AWS API/Aurora boundary described in
[`docs/estimate-api.md`](./estimate-api.md); the original Supabase estimate prototype is no
longer active. The behavioral authority is the
desktop project at `C:\Users\sethb\Web Projects\Perfect Shade Tool`. The desktop application
remains supported and was not modified.

The review covered all files under `app/`, all tests, `README.md`, `AGENTS.md`, the current DOCX
template and its template tags, every available JSON output, the collision-output sample, and
representative generated DOCX files. The desktop suite passes all 20 tests. LibreOffice was not
available for raster QA, so existing DOCX samples were inspected structurally through every
paragraph and table.

## Desktop parity matrix

| Area | Verified desktop behavior | Phase 1 | Later phase / note |
| --- | --- | --- | --- |
| Document type | `Bid Proposal` default; `Estimate` is the only alternative; unsupported saved values normalize to `Bid Proposal`. | Persisted and selectable during minimal create. | Full editor in Phase 2. |
| Bid metadata | Bid number, bid date, valid through, and bid due are optional free-text fields. | Schema preserves free text; minimal create exposes bid number only. | Remaining fields in Phase 2. |
| Project | Project Name is required; Project Location is optional. | Customer, project, and estimate snapshot are created atomically. | Full project editor and record reuse in Phase 2. |
| Architect / Prepared For | Desktop UI and template say `Architect`; data property is `prepared_for`; required. | Web uses the approved visible term `Architect` and stores `prepared_for`. | Confirm whether non-architect recipients need a future label choice. |
| Owner / contact | Desktop UI and template say `Owner`; stored as optional multiline `contact_information`. | Preserved as an optional estimate snapshot and customer contact field. | Structured contacts are not yet designed. |
| Scope rows | Three blank rows initially; blank rows omitted; maximum 20; scope itself is optional. | Ordered organization-scoped table exists. | Editor in Phase 2. |
| Base pricing | Three blank rows initially; maximum 50; blank rows omitted; amount is required for a nonblank row; description may be blank; at least one valid amount required. | Exact money parser, ordered table, and one required first row in create flow. | Dynamic row editor in Phase 2. |
| Alternate pricing | One blank row initially; maximum 20; opt-in; enabled section requires at least one valid amount. | Separate line kind and inclusion flag are modeled. Alternates are not part of create UI. | Editor and validation in Phase 2. |
| Alternate total | Sum of alternate amounts; never included in base subtotal, total, deposit, or balance. | Domain policy and schema separation documented; tested against base-total calculation. | Live alternate total in Phase 2. |
| Deposit | Desktop defaults to 0%; accepts an exact decimal; must be between 0 and 100 inclusive. | Exact parser, validation, persistence, and minimal create are implemented. The approved Phase 2 web UX now defaults new drafts to 50% while preserving stored values. | Live editor delivered in Phase 2. |
| Sales tax | No editable UI. Rate is hardcoded to zero, tax amount is zero, and tax is excluded from total. A constant tax notice is rendered. | Tax stays zero and database checks enforce exclusion. | Any change requires a deliberate business decision. |
| Subtotal | Sum of parsed base amounts, rounded to cents. Each entered amount is already restricted to cents. | Exact sum of integer minor units. | Live display in Phase 2. |
| Total | Exactly equal to subtotal; no tax or alternates included. | Enforced in domain and database checks. | Live display in Phase 2. |
| Required deposit | `total × deposit / 100`, rounded to cents with Decimal `ROUND_HALF_UP`. | Implemented as exact integer/rational arithmetic; PostgreSQL numeric check matches. | Live display in Phase 2. |
| Remaining balance | `total - rounded required deposit`. | Implemented and constrained. | Live display in Phase 2. |
| Retainage | Constant: “Maximum retainage shall be limited to 5% of the contract amount unless otherwise agreed in writing.” | Recorded as document policy; not editable or persisted per estimate. | Preview in Phase 3. |
| Prevailing Wage | Optional checkbox; editable text defaults to the approved statement; empty enabled text falls back to the default. Section appears after additional terms and before Measurement Readiness. | Inclusion flag and statement are persisted with the desktop default. | Editor and conditional preview in Phase 3. |
| Terms | Pricing-valid days and estimated lead time are optional free text. Core deposit, balance, scope-change, tax, and retainage terms are constant. | Fields and ordered additional-term records are modeled. | Editor and constant terms in Phase 3. |
| Additional terms | One blank row initially; maximum 20; blanks omitted; DOCX renders a heading and bullet list only when populated. Legacy `additional_terms` is a newline join of the rows. | Ordered term table exists. | Editor and compatibility export in Phase 3. |
| Addenda | One blank row initially; no coded maximum; blanks omitted; section appears only when populated. | Ordered addenda table exists. | Editor and conditional preview in Phase 3. |
| Measurement Readiness | Constant approved heading and paragraph; always rendered. | Recorded as constant document policy. | Preview in Phase 3; generation in Phase 4. |
| One-year Warranty | UI calls this `Craftsmanship Warranty`; constant one-year installation-labor warranty and exclusions; always rendered. | Recorded as constant document policy. | Preview in Phase 3; generation in Phase 4. |
| Company Qualifications | Constant approved company paragraph; always rendered. | Recorded as constant document policy. | Preview in Phase 3; generation in Phase 4. |
| Project notes | Optional free text; section appears only when nonblank. | Persisted. | Editor and conditional preview in Phase 3. |
| Signature | Perfect Shade authorized signer and signature date are optional; current template contains fixed Sheri Brannan signature content and uses the entered signature date. | Persisted for parity. | Clarify signer-field/template mismatch before Phase 4. |
| Validation | Requires Project Name, Architect, at least one valid base amount, 0–100 deposit, output folder, and a valid alternate when enabled. | Project/Architect/base/deposit validation implemented in minimal flow. | All row and editor validation in Phase 2; output validation in Phase 4. |
| Money input | Trim; remove `$` and commas; accept optional `-`, digits, and zero to two decimal places; reject blank and higher precision. Negative pricing is allowed. | Implemented and unit tested. | UI may add guidance but must not silently reject credits. |
| Percentage input | Blank becomes zero; `%` is removed; Python Decimal notation is accepted; non-finite values fail later validation. | Exact finite decimal and exponent notation are accepted. | Deliberate difference: web rejects non-finite values explicitly. |
| JSON export | Always created; Decimal values serialize as fixed two-decimal strings; includes form fields, calculated values, output choices, and output folder. | Domain/schema can produce structured data; download/export is not implemented. | Phase 4. |
| DOCX | Optional and checked by default; rendered with `docxtpl` and the bundled template. | Not implemented by scope. | Phase 4 with approved-output comparison. |
| PDF | Disabled with “future task” messaging. | Not implemented. | Remains out of scope until explicitly approved. |
| Filenames | `YYYY-MM-DD - Project Name - Perfect Shade Bid.ext`; remove Windows-invalid characters, collapse whitespace, trim trailing dots/spaces, fallback to `Untitled Project`. | Not implemented because no file generation occurs. | Phase 4. |
| Collisions | Preserve existing files; append ` (2)`, ` (3)`, and upward. | Not implemented. | Phase 4; web downloads may use storage object versioning plus collision-safe names. |
| Conditional document sections | Addenda, alternates, additional terms, prevailing wage, and notes are conditional. Scope loop may be empty. Constants always appear. | Conditions represented by fields/child rows. | Preview in Phase 3; DOCX in Phase 4. |
| Defaults and limits | 3 scope, 3 base price, 1 alternate, 1 addendum, 1 term; limits 20/50/20/20 respectively, with no coded addenda limit. | Defaults are documented; minimum flow creates one base row. | Dynamic UI defaults/limits in Phases 2–3. |

## Domain model

Persistence and editor state are deliberately separate:

- `Customer`: organization-owned business/customer record.
- `Project`: belongs to one customer and organization.
- `Estimate`: an organization-owned project estimate and its desktop-compatible snapshot fields.
- `EstimateScopeItem`: ordered description.
- `EstimatePricingLine`: ordered `base` or `alternate` description and integer minor-unit amount.
- `EstimateTerm`: ordered additional term/exclusion.
- `EstimateAddendum`: ordered acknowledgement.
- `EstimateFormState`: future client-side editable strings and blank rows; not used as a database shape.
- `EstimateTotals`: derived authoritative integer minor-unit totals.

The estimate keeps project name, location, Architect, and Owner/contact snapshots even though the
normalized customer and project also exist. Issued documents must not change if a customer or
project record is edited later.

## Money and rounding specification

1. Authoritative money is stored as signed `bigint` minor units.
2. Authoritative percentage values are exact PostgreSQL `numeric`; TypeScript parses them into
   an integer coefficient plus decimal scale.
3. JavaScript `number` is never used in authoritative calculations.
4. Each accepted money input has at most two decimals and is converted exactly to minor units.
5. Subtotal is the exact sum of base line minor units.
6. Sales-tax amount is zero.
7. Total equals subtotal.
8. Required deposit is calculated once from total and the exact percentage, with ties rounded
   away from zero. This matches Python Decimal `ROUND_HALF_UP`.
9. Remaining balance is exact subtraction of the rounded deposit from total.
10. Alternate amounts are summed separately and never supplied to the base-total function.

The Lambda repeats the calculation and Aurora repeats the total invariants as check constraints.
PostgreSQL `round(numeric)` has the same tie behavior as the domain function.

## AWS persistence and ownership

`customers`, `projects`, `estimates`, and every estimate child table carry:

- `organization_id`
- `created_by`
- `updated_by`
- `created_at`
- `updated_at`

Composite organization foreign keys reject a child whose parent belongs to another organization.
An update trigger prevents moving records between organizations. Every account-scoped index
begins with `organization_id`.

API Gateway validates the Cognito JWT. Lambda consumes only its immutable `sub`, begins an
explicit Data API transaction, and calls a controlled database function that resolves exactly
one active membership and establishes transaction-local actor, organization, and role context.
The API does not accept an organization or actor ID.

Aurora defense in depth:

- Every query includes an explicit resolved `organization_id` predicate.
- Every tenant table has `ENABLE ROW LEVEL SECURITY` and `FORCE ROW LEVEL SECURITY`.
- The Lambda runtime role is a non-owner without `BYPASSRLS`, schema creation, role creation, or
  physical-delete grants.
- Insert/update policies bind tenant and audit fields to transaction-local context.
- Composite organization foreign keys reject cross-tenant links.
- Customers, projects, and estimates use `deleted_at`/`deleted_by`; only owner/admin context
  may change those fields.
- Issued estimates and their scope, pricing, terms, and addenda are immutable.
- Audit events are append-only.

## Minimal Phase 1 flow

`/app/estimates` calls `GET /v1/estimates` and lists non-deleted estimates for the active
organization. `/app/estimates/new` calls `POST /v1/estimates/drafts` with an idempotency key.
The Data API transaction atomically creates:

1. a customer,
2. a project,
3. a draft estimate snapshot, and
4. the first base pricing line, and
5. an append-only audit event.

This is deliberately not the Phase 2 editor. It does not add dynamic rows, live totals, draft
updates, preview, duplication, document output, or status transitions.

## Revision path

The approved model stores status, `revision_number`, `source_estimate_id`, `issued_at`, and
audit fields on each estimate record. Issued records and child rows are frozen by database
triggers. A correction creates a new draft record linked to the issued source and increments the
revision number. Phase 1 establishes this schema and enforcement only; revision/status UI remains
Phase 4 work.

## Deliberate web differences

- Phase 1 requires a Customer Name because the account architecture requires
  customer → project → estimate ownership. The desktop has only an Owner free-text field.
- Web storage uses UUIDs and organization scope instead of filenames as record identity.
- Finite exact decimal percentages are accepted, including exponent notation; non-finite Decimal
  values are rejected explicitly instead of failing indirectly during desktop comparison.
- Filename collision behavior is deferred until files exist in Phase 4.
- The minimal flow creates one base pricing row rather than displaying three blank editor rows.

## Ambiguities requiring business decisions

- Whether `Architect` should remain fixed or become a selectable `Prepared For` role.
- Customer/project duplicate detection and import reconciliation.
- The exact legal retention period for issued estimates and audit events.
- Whether sales tax should ever enter authoritative totals. Current behavior says no.
- Whether dates remain free text or gain normalized date values plus display snapshots.
- Whether the authorized-signer input should replace the template's fixed Sheri Brannan content.
- Whether child-row deletion by staff is an edit operation or must remain owner/admin-only.

Legacy QA JSON samples contain manually supplied balances that disagree with the current
calculation function. Current source, calculation tests, and UI-calculated outputs are
authoritative.

## Remaining phases

### Phase 2

Project and estimate editing, dynamic scope/base/alternate rows, complete validation, draft
saving, and live exact totals.

### Phase 3

Terms, addenda, prevailing wage, constant/conditional sections, and estimate preview.

### Phase 4

DOCX generation, approved-sample comparison, JSON/structured download, storage naming and
collision handling, duplication, revisions/status workflow, and browser/integration tests.
