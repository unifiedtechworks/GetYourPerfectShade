# Web Estimate Builder Phase 2

## Scope

Phase 2 adds the protected draft editor, exact live totals, draft detail/update API, and ordered
scope/base/alternate persistence. The desktop project at
`C:\Users\sethb\Web Projects\Perfect Shade Tool` remains the behavioral authority and was not
modified.

Phase 2 deliberately excludes terms/addenda/prevailing-wage editing, preview, document output,
JSON download, duplication, revisions, and status transitions.

## Desktop parity record

| Behavior | Desktop authority | Phase 2 web behavior |
| --- | --- | --- |
| Project wording | `Project Name`, `Project Location`, `Architect`, and multiline `Owner` | Preserved exactly; Architect remains required and maps to `prepared_for`. |
| Dates | `Bid Date`, `Valid Through`, and `Bid Due` are optional free text | Preserved as free text; no date parsing or automatic default was invented. |
| Document identity | `Bid Proposal` default; `Estimate` alternative; optional `Bid Number` | Preserved. The protected record UUID and draft status are also displayed as web metadata. |
| Customer | Desktop has only the Owner field | The approved Phase 1 workflow creates a customer and project atomically. The editor displays the linked customer read-only and edits the project/estimate snapshot. |
| Scope rows | 3 blank rows initially; blank rows omitted; maximum 20 | The approved web default is 1 visible row. Additional rows appear only after Add; saved multi-row estimates still reload completely. Blank rows are omitted on save; maximum 20. |
| Base pricing | 3 blank rows; maximum 50; both-blank rows omitted; description-only row fails; description may be blank when amount exists; at least one amount required | The approved web default is 1 visible row. Additional rows appear only after Add; saved multi-row estimates still reload completely. Validation, negative credits, and maximum 50 remain unchanged. |
| Alternate pricing | 1 blank row; maximum 20; opt-in requires at least one valid amount | The table is hidden while inclusion is off and starts with exactly 1 row when enabled. Hiding does not clear saved or unsaved alternate rows. |
| Alternate total | Separate from subtotal, total, deposit, and balance | Shown only while alternate pricing is enabled. Alternate rows remain separately persisted and are never supplied to main-total calculation. |
| Sales tax | No editable rate; rate and calculated tax are zero; tax notice is constant | Displayed read-only as fixed 0% / $0.00. It remains excluded from totals. |
| Deposit | Defaults to 0%; exact decimal; 0 through 100 | The approved web new-draft default is 50%. Existing estimates retain their stored percentage. Exact parsing, 0–100 validation, and canonicalization remain unchanged. |
| Rounding | Decimal `ROUND_HALF_UP` | Exact integer/rational round-half-away-from-zero, equivalent for signed values. No authoritative floating point is used. |
| Retainage | Constant 5% maximum term; does not change calculations | Shown as read-only policy text and excluded from calculations. Full terms rendering remains Phase 3. |
| Validation | Project Name, Architect, one base amount, valid deposit, and valid enabled alternate required | Preserved. Output-folder validation is not applicable until document generation. |

## Live calculation policy

Authoritative amounts use signed `bigint` minor units and API string serialization. The editor
keeps input as strings, parses them with the shared desktop-compatible money parser, and derives:

1. `subtotal = sum(base pricing lines)`;
2. `sales tax = 0`;
3. `main total = subtotal`;
4. `required deposit = round-half-up(main total × deposit percent / 100)`;
5. `remaining balance = main total - required deposit`;
6. `alternate total = sum(alternate lines)`, kept outside all main calculations.

Lambda recalculates every saved total, and the existing Aurora constraints independently enforce
the main total, deposit, and balance invariants.

## API additions

### `GET /v1/estimates/{estimateId}`

Returns one non-deleted estimate, its linked customer/project metadata, ordered scope rows,
ordered base/alternate pricing rows, exact canonical totals, `rowVersion`, and audit metadata.
Every query uses the server-resolved organization ID plus forced RLS. A missing or another
organization's ID returns the same `estimate_not_found` response.

### `PUT /v1/estimates/{estimateId}`

Accepts the complete editable Phase 2 draft state and `expectedRowVersion`. The handler derives
actor, organization, and role from the validated Cognito `sub`; caller-supplied identity fields
are rejected.

The transaction locks the estimate, rejects non-drafts, rejects stale versions, updates project
and estimate snapshots/totals, replaces ordered Phase 2 rows through the controlled database
function, appends `estimate.draft_updated`, reloads the canonical result, and commits. Any error
rolls back the entire operation.

Stable update errors include:

- `estimate_not_found` (404)
- `estimate_not_editable` (409)
- `stale_estimate` (409)
- `invalid_request` (400)

## Database change

`infra/database/migrations/0005_estimate_phase_2.sql` adds:

- draft-only, current-organization RLS delete policies for scope and pricing children;
- `app_private.replace_estimate_phase_2_rows(uuid, jsonb, jsonb, jsonb)`;
- row-shape, bigint, row-count, organization, and draft-state checks;
- runtime-role `EXECUTE` permission on that function only.

The Lambda runtime role still has no direct table `DELETE`, schema, role, or RLS-bypass grant.
The replacement operation executes within the API's existing explicit Data API transaction.
Migrations `0001` through `0004` were not modified.

## Draft UX and save behavior

- Creation continues through the approved Phase 1 customer → project → draft transaction, then
  redirects to `/app/estimates/{estimateId}`.
- The editor uses explicit Save. Autosave is intentionally omitted so network/stale failures do
  not obscure the last committed version.
- Save buttons use React form pending state to prevent repeated submission.
- The server's optimistic row-version check prevents a duplicate or stale request from
  overwriting the first committed save.
- Success and error notices clear on the next edit. Unsaved changes are shown visibly, and a
  browser-unload warning is registered while dirty.
- Removing a nonblank row asks for confirmation; removing a blank row does not.
- Issued and other non-draft estimates render read-only and are independently rejected by API
  and database protections.

## Intentional web differences

- Customer Name is a linked, read-only record in the editor because changing a normalized
  customer could affect other projects. Creating/selecting reusable customer records is a
  separate customer-management workflow; current creation behavior remains approved.
- The desktop begins with 3 scope rows and 3 base-pricing rows. The approved web UX begins each
  enabled section with 1 row and requires explicit Add actions for more rows; existing saved
  multi-row estimates are never collapsed or truncated.
- The desktop deposit default is 0%. New web drafts intentionally default to 50%, while every
  existing estimate continues to display and save its stored deposit percentage.
- The web hides the alternate table and alternate total while inclusion is disabled. Alternate
  row state is retained across disable/re-enable and remains outside the main total.
- Invalid live money rows are excluded from the provisional display total and shown as field
  errors on save; the desktop leaves the previous total visible. Neither application commits an
  invalid row.
- Nonblank row removal asks for confirmation because a later Save persists the removal. The
  desktop removes selected rows immediately without confirmation.
- Internal UUID, status, revision, and last-saved time are shown because web records are not
  identified by local filenames. Raw Cognito actor IDs remain tracked in Aurora/API audit data
  but are not serialized into the client editor component.

## Deployment and integration

Chat 4 must integrate the application/API/CDK changes together. Before live Phase 2 use:

1. deploy the updated authenticated GET/PUT API routes;
2. apply migration `0005_estimate_phase_2.sql` through the controlled migration runner;
3. run same-organization fetch/save/reload with synthetic data;
4. verify cross-organization denial, issued rejection, stale-version rejection, and forced
   rollback against the development runtime role;
5. confirm public pages and existing Cognito account flows remain unchanged.

No migration or infrastructure deployment is performed by this feature branch.

## Deferred work

- Phase 3: terms/exclusions, addenda, prevailing wage, constant/conditional sections, preview.
- Phase 4: DOCX/PDF, JSON export, collision-safe output, duplication, revision/status workflow,
  and approved desktop-output comparison.
