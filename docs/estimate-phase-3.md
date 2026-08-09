# Estimate Builder Phase 3

## Scope

Phase 3 extends the existing protected estimate editor and the authenticated
`GET`/`PUT /v1/estimates/{estimateId}` contract. It adds ordered addenda, ordered additional
terms/exclusions, lead-time and pricing-validity inputs, optional prevailing-wage wording,
project notes, desktop-authoritative constant proposal sections, and a protected print-style
saved-draft preview.

Phase 3 does not add document download generation, estimate duplication, revision creation,
status transitions, customer-management UI, or a replacement for the desktop tool. Those remain
Phase 4 or later work.

## Approved defaults and editor behavior

- Addenda and Additional Terms / Exclusions each start with exactly one blank multiline row and
  provide explicit add, remove, move-up, and move-down controls.
- Blank rows are removed from the persisted request. Saved rows retain their order and multiline
  content. The editor always keeps one visible row after removing the last row.
- Additional Terms / Exclusions retain the desktop maximum of 20 rows.
- Addenda remain optional and have no desktop-defined row cap. API Gateway request-size controls
  still bound the request.
- Prevailing Wage defaults off. Its editable default wording is exactly:
  `Applicable prevailing wage labor rates are included where required by the project.`
- Custom prevailing-wage wording remains in form state and persistence while the checkbox is off.
  It is included in the preview only while enabled.
- Lead time, pricing-valid-days, and project notes default to blank because that is the current
  desktop behavior.
- Phase 2's approved web defaults remain unchanged: one scope row, one base-pricing row, one
  alternate row when enabled, a 50% deposit for new drafts, hidden disabled alternates, and
  alternates excluded from the contract total.

The one-row scope/pricing defaults and 50% new-draft deposit are intentional approved web UX
differences from the current desktop tool, which starts with three scope rows, three pricing rows,
and a 0% deposit.

## Desktop-authoritative proposal wording

The following sections use the current desktop source and DOCX template verbatim:

- Measurement Readiness
- One-Year Craftsmanship Warranty
- Company Qualifications
- sales-tax notice
- maximum 5% retainage term
- default Prevailing Wage statement

The task shorthand referenced “One final field measurement visit per phase,” but that sentence is
not present in the current desktop source, template, tests, or approved sample output. Phase 3 does
not invent it. The full current desktop Measurement Readiness paragraph is the implemented source
of truth pending an explicit business wording change.

Retainage is proposal wording only. It does not reduce subtotal, total, required deposit, or
remaining balance. Tax remains fixed at 0% in authoritative calculations while the proposal says
applicable sales tax will be added unless an exemption certificate is provided.

## Preview behavior and section order

`/app/estimates/{estimateId}/preview` uses the same Cognito session, estimate API, membership
resolution, tenant predicates, and forced RLS as the editor. It loads the last saved API snapshot;
unsaved browser state is intentionally excluded. The editor tells the user to save first and the
preview is clearly labeled `Draft preview - not a final document`.

The preview order is:

1. project/proposal metadata;
2. Scope of Work;
3. Addenda Acknowledgement, when nonempty;
4. base Pricing;
5. Alternate Pricing, only when enabled and nonempty;
6. core Terms;
7. Additional Terms / Exclusions, when nonempty;
8. Prevailing Wage, only when enabled;
9. Measurement Readiness;
10. One-Year Craftsmanship Warranty;
11. Company Qualifications;
12. Project Notes, when nonempty.

The preview contains no actor IDs, audit metadata, row versions, organization IDs, or internal
timestamps. It is a browser/print preview, not Phase 4 document generation.

## Persistence and authorization

The Phase 1 schema already owns the needed estimate fields plus `app.estimate_terms` and
`app.estimate_addenda`, so no new business columns are required. Migration
`0006_estimate_phase_3.sql` adds only:

- draft-constrained tenant delete policies for the two child tables; and
- `app_private.replace_estimate_phase_3_content(uuid, jsonb, jsonb)`.

The security-definer function resolves organization and actor from transaction-local authenticated
context, refuses a missing/cross-organization/non-draft parent, validates nonblank rows and the
20-term limit, and preserves input order with ordinality. The runtime role retains no direct table
`DELETE` grant.

The existing update transaction now locks and validates the draft, updates project/header fields,
replaces Phase 2 scope/pricing rows, replaces Phase 3 terms/addenda, appends one
`estimate.draft_updated` audit event, reloads the canonical detail, and commits. Any failure rolls
back all changes; a failed or stale save produces no audit event.

## Deployment boundary

This source task does not deploy AWS or apply migrations. A separately authorized deployment must
deploy the integrated application/Lambda code and apply migrations in deterministic order through
the controlled administrative migration runner. Existing migrations `0001` through `0005` are
immutable; Phase 3 is `0006_estimate_phase_3.sql`.
