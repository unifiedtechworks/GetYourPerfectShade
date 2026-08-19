# Estimate Builder acceptance and hardening

## Scope and evidence

This acceptance pass covers the integrated Phase 1-4 estimator at base commit
`3179d6fb750d4d1f664c7988c2d337ed1f097f79`. It compares the web source,
tests, migrations, and Phase 1-4 documentation with the read-only desktop
project at `C:\Users\sethb\Web Projects\Perfect Shade Tool`, including its
current source, tests, DOCX template, JSON samples, and the approved
`2026-08-01 - test - Perfect Shade Bid (3).docx` / PDF pair.

The hosted development application's public route and unauthenticated
protected-route redirect were checked at desktop and mobile widths. No owner
credentials were requested, captured, logged, or stored. Authenticated hosted
mutations remain a manual owner acceptance gate.

Status terms used below:

- **Exact parity**: the web behavior preserves the current desktop rule.
- **Intentional web improvement**: an approved web-only behavior is preferable
  and already documented.
- **Known acceptable difference**: output or architecture differs by design
  without changing the business result.
- **Defect fixed**: this pass corrected a concrete regression or reliability
  gap and added regression coverage.
- **Deferred future feature**: deliberately outside Phases 1-4.

## Acceptance matrix

| Workflow area | Status | Acceptance result |
| --- | --- | --- |
| Customer/project creation | Intentional web improvement | One protected command atomically creates the organization-owned customer, project, draft, first base line, idempotency record, and audit event. Desktop has only an Owner text field. Reusable customer/project management remains deferred. |
| Initial Scope row | Intentional web improvement | A new draft editor shows one row; existing saved rows all load. Add/remove cannot leave an enabled editor without one visible row. Desktop starts with three. |
| Initial base Pricing row | Intentional web improvement | A new draft editor shows one row; existing saved rows all load. The 50-row cap and at-least-one-valid-amount rule are preserved. Desktop starts with three. |
| Alternate Pricing default | Intentional web improvement | Disabled alternates are completely hidden. Enabling shows one row. Disabling preserves row state and never changes the main total. |
| Deposit default | Intentional web improvement | New drafts default to 50%; a stored explicit value, including `0`, is preserved. Desktop defaults to 0%. |
| New estimate identifiers | Known acceptable difference | Database UUID, draft status, revision 1, and row version 1 are server-owned. Bid Number remains optional and blank unless entered. |
| Required create fields | Exact parity plus web ownership | Project Name, Architect, and a valid base amount are required; Customer Name is additionally required by the normalized web ownership model. |
| Create validation and errors | Defect fixed | Local money/percentage validation remains specific. Stable secret-safe API messages now reach the create form instead of being replaced by a generic error. Unexpected failures remain generic. |
| Duplicate create submission | Defect fixed | Pending UI still disables the submit button. A server-rendered form key is now reused by repeated submissions, so the existing database idempotency command returns one draft after an interrupted or duplicated request. |
| Project/proposal fields | Exact parity | Document Type, Bid Number, Bid Date, Valid Through, Bid Due, Project Name, Location, Architect (`prepared_for`), and multiline Owner are preserved as desktop-compatible snapshots. |
| Scope editing | Exact parity | Ordered insertion/removal, blank suppression, multiline-safe persistence, and the 20-row cap are preserved. Neither desktop nor web provides scope drag/reorder controls. |
| Base pricing editing | Exact parity | Ordered rows, blank-row suppression, optional description, required amount for a nonblank row, negative credits, 50-row cap, and at least one valid amount are preserved. |
| Alternate editing | Exact parity plus approved visibility | Ordered rows, optional description, valid amount requirement when enabled, 20-row cap, preserved disabled state, and separate total are preserved. |
| Amount-only pricing output | Defect fixed | A valid base or alternate row with an empty description is now retained in preview, DOCX, and PDF. Previously the amount remained in totals but the line disappeared from client output. |
| Money parsing | Exact parity | `$` and comma removal, signed values, zero-to-two decimals, and exact integer minor units are preserved. Authoritative calculations never use floating point. |
| Sales tax | Exact parity | Rate and amount remain zero and excluded from the total; the approved tax notice remains proposal wording. |
| Subtotal and total | Exact parity | Subtotal is the exact sum of base lines; total equals subtotal. Alternates and retainage never enter the main calculation. |
| Deposit and balance | Exact parity | Exact decimal percentages from 0 through 100 use round-half-away-from-zero, equivalent to desktop `Decimal.ROUND_HALF_UP`, followed by exact subtraction. |
| Retainage | Exact parity | The maximum-5% sentence is constant proposal wording and has no financial effect. |
| Addenda | Intentional web improvement | One initial multiline row, blank suppression, persistence order, unbounded desktop-compatible row count, and explicit Up/Down controls are supported. The section is conditional in client output. |
| Additional Terms / Exclusions | Intentional web improvement | One initial multiline row, blank suppression, 20-row cap, persistence order, and explicit Up/Down controls are supported. The section is conditional in client output. |
| Prevailing Wage | Exact parity | Defaults off with the approved fallback wording. Custom wording is preserved while disabled and rendered only when enabled and nonblank. |
| Lead time and pricing-valid days | Exact parity with client-ready suppression | Both remain optional free text. Blank values suppress their sentences, and trailing lead-time punctuation is normalized to prevent malformed client text found in the retained sparse desktop sample. |
| Project Notes | Exact parity | Optional multiline content is stored and rendered only when nonblank. |
| Measurement Readiness | Exact parity | The current desktop-authoritative constant heading and paragraph always render. |
| One-Year Craftsmanship Warranty | Exact parity | The current desktop-authoritative constant warranty and exclusions always render. |
| Company Qualifications | Exact parity | The current desktop-authoritative company paragraph always renders. |
| Save/reload | Intentional web improvement | Explicit save persists one canonical transaction and reloads canonical ordered rows and totals. No autosave obscures the last committed version. |
| Dirty-state protection | Intentional web improvement | Visible dirty status, disabled clean-save buttons, unload warning, and saved-preview/document/lifecycle guards protect unsaved work. In-app link interception is not implemented; owner acceptance should verify the browser warning on navigation/reload. |
| Stale row version | Intentional web improvement | A stale save receives a stable conflict and a Reload latest draft action. The failed transaction cannot replace rows or append an audit event. |
| Draft-only editing | Intentional web improvement | Issued and other non-draft records render read-only and are independently protected by API validation, forced RLS, and immutable-row triggers. |
| Keyboard/screen-reader row controls | Defect fixed | Repeated Remove/Up/Down buttons now have row-specific accessible names while retaining keyboard-native button behavior. |
| Mobile editor layout | Intentional web improvement | Project, metadata, pricing, totals, action clusters, and rows collapse to a single-column layout at 700px. Authenticated hosted editor interaction remains a manual gate. |
| Preview hierarchy and conditions | Exact parity | Approved blue hierarchy, information table, ordered sections, totals, conditional content, authorization block, and footer are preserved without actor, tenant, row-version, or storage metadata. |
| Browser print | Known acceptable difference | Print CSS isolates the proposal, requests Letter geometry, hides protected application chrome, preserves table rows/headings/authorization where practical, and targets two-page reference density. Browser headers/footers still require the user to disable that print-dialog option. |
| DOCX | Known acceptable difference | Deterministic Node OOXML follows the approved layout/content but is not the desktop `docxtpl` file. It remains editable and Office-independent in AWS. |
| PDF | Known acceptable difference | Direct `pdf-lib` output preserves content and hierarchy without Word. Helvetica metrics can wrap differently from desktop Word/Aptos. |
| JSON | Intentional web improvement | Versioned UTF-8 export uses fixed two-decimal money strings and ordered proposal content while excluding workstation paths, output toggles, tenant/actor IDs, row versions, S3 keys, and credentials. |
| Filenames and collisions | Known acceptable difference | The readable desktop core is preserved with stronger sanitization. UUID-based S3 keys make repeated visible filenames collision-safe without probing or overwriting objects. |
| Document history/download | Intentional web improvement | Organization-authorized immutable history exposes safe metadata only. Ready documents receive five-minute attachment URLs; pending/failed records are not downloadable. |
| Document interruption/recovery | Intentional web improvement plus defect fixed | Pending upload/finalization recovery and checksum verification remain server-owned. The UI now reuses a command key after an ambiguous failure, enabling the documented same-request replay; it rotates after success or a terminal failed-storage/idempotency response. |
| Issue estimate | Intentional web improvement | Explicit idempotent issue validates completeness, freezes the revision, records actor/timestamp/audit data, and cannot partially issue. |
| Create revision | Intentional web improvement | Only an issued estimate can create the next linked draft. The immediate source remains frozen and documents are not copied. |
| Duplicate estimate | Intentional web improvement | Draft or issued content creates an independent revision-one draft on the same project with blank Bid Number, no source link, and no document history. |
| Retry/idempotency | Defect fixed | Draft creation, issue, duplicate, revision, and document generation now retain the same browser command key across ambiguous retries; server request hashes, unique constraints, and replay tests remain authoritative. |
| Tenant ownership/audit | Intentional web improvement | Cognito subject resolves one active membership; every query repeats organization predicates under forced RLS. Mutable records track creator/updater, and lifecycle/document events are append-only. |
| Signature | Deferred owner decision | Exact rendering support remains private and deployment-controlled. This pass did not change or enable signature configuration. |
| Accepted/declined/expired/void, e-signature, payment, email | Deferred future feature | Schema reservations are not exposed as incomplete workflows. |

## Concrete defects corrected

1. Preview, DOCX, and PDF filtered pricing rows by nonblank description even
   though desktop and web validation permit an empty description with a valid
   amount. The renderers now retain every persisted pricing row while continuing
   to suppress blank text-only sections.
2. Draft creation and Phase 4 UI commands generated idempotency keys inside each
   server-action invocation. A repeated request after an ambiguous response
   therefore could not replay the original command. Creation now carries one
   form-scoped key, and lifecycle/document actions retain one per command attempt
   until success or a response that explicitly requires a fresh request.
3. Draft creation discarded the API's stable secret-safe error and always showed
   a generic failure. Safe API messages are now preserved; unknown errors remain
   generalized.
4. Repeated row action buttons had visually understandable text but no
   row-specific accessible name. Contextual labels now identify the affected
   scope, pricing, alternate, addendum, or term row.

No database migration, schema change, public marketing change, product-data
change, image change, deployment, AWS mutation, or desktop-project change is
part of this hardening pass.

## Manual authenticated owner acceptance

Use development/test records only. Keep browser paper size at Letter and disable
**Headers and footers** for clean browser printing.

1. Sign in through the development site with an existing test staff account;
   do not share credentials with the acceptance operator.
2. Create a draft and double-click Create once while the first request is
   pending. Confirm one draft, one customer/project chain, one base row, and a
   50% deposit.
3. Confirm one Scope row and one base Pricing row. Enable alternates, enter an
   amount with a blank description, disable/re-enable, save, and reload. Confirm
   the row remains and main totals do not change.
4. Exercise maximum rows, negative credit, zero amount, multiline descriptions,
   remove confirmation, addenda/term Up/Down controls, keyboard focus, and mobile
   layout.
5. Open two sessions on the same draft, save one, then save the stale session.
   Confirm the stale warning and Reload latest draft recovery.
6. Generate DOCX, PDF, and JSON from the saved amount-only test. Confirm the
   line appears in preview and both proposal documents, all totals match, JSON
   contains no internal metadata, filenames are safe, and history/downloads are
   associated with the correct estimate revision.
7. Interrupt or simulate a recoverable document finalization response through
   the approved development test harness, retry once, and confirm the same
   history record finalizes without duplicate ready objects.
8. Issue a complete draft and confirm it is read-only. Create a revision and a
   duplicate, then confirm linkage/independence and that neither new draft owns
   the source document history.
9. Print the saved preview at desktop and mobile browser widths. Confirm no app
   chrome prints and a reference-density estimate is approximately two Letter
   pages; record the browser/version and any pagination difference.

Production-user acceptance should begin only after these authenticated hosted
checks pass and the business owner separately decides whether to enable the
private company-signature asset.
