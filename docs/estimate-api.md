# Estimate API Contract

## Boundary and authentication

The protected estimate application uses an API Gateway HTTP API in `us-west-2`. API Gateway's
Cognito JWT authorizer must validate the access token before invoking Lambda. Estimate handlers
read only `requestContext.authorizer.jwt.claims.sub`; they reject a missing claim and never
accept a caller-supplied actor, user, role, or organization ID.

Inside an explicit Data API transaction,
`app_private.establish_estimate_context(subject)` resolves exactly one active Aurora
membership, returns the actor/organization/role, and sets transaction-local
`app.actor_id`, `app.organization_id`, and `app.organization_role`. A missing, disabled,
removed, or ambiguous membership fails closed. Cognito groups and attributes never determine the
application role.

## Endpoints

### `GET /v1/estimates`

Lists non-deleted estimates for the resolved organization, ordered by `updated_at DESC, id DESC`.
Every SQL query contains `organization_id = :organizationId` in addition to forced RLS.

Query parameters:

- `limit`: optional integer, 1–100, default 25.
- `cursor`: optional opaque base64url keyset cursor containing the prior row's timestamp and ID.

Response:

```json
{
  "data": [
    {
      "id": "uuid",
      "documentType": "Bid Proposal",
      "estimateNumber": "B-100",
      "projectName": "Atrium",
      "preparedFor": "Morgan Architect",
      "status": "draft",
      "totalMinor": "125050",
      "updatedAt": "2026-08-01T12:00:00Z"
    }
  ],
  "page": { "nextCursor": null }
}
```

### `POST /v1/estimates/drafts`

Requires an `Idempotency-Key` header of 16–200 safe characters. The Next.js server action uses
a UUID. Request:

```json
{
  "customerName": "Acme",
  "projectName": "Atrium",
  "projectLocation": "Portland",
  "preparedFor": "Morgan Architect",
  "contactInformation": "Owner",
  "documentType": "Bid Proposal",
  "estimateNumber": "B-100",
  "pricingDescription": "Window coverings",
  "pricingAmountMinor": "125050",
  "depositPercent": "20"
}
```

Response (201 for the first request and an identical-key replay):

```json
{
  "data": {
    "estimateId": "uuid",
    "status": "draft",
    "replayed": false
  }
}
```

`replayed` is true when the same key and canonical request hash return the previously committed
draft. Reusing a key for a different request returns `idempotency_conflict` (409).

The command validates the payload before authoritative calculation, then runs one Data API
transaction:

1. resolve membership and establish database context;
2. reserve the organization-scoped idempotency key;
3. insert customer;
4. insert project;
5. insert draft estimate;
6. insert the initial base-pricing row;
7. insert `estimate.draft_created` audit event;
8. associate the idempotency record with the estimate;
9. commit.

Any error attempts rollback. Success is never returned before commit succeeds.

### `GET /v1/estimates/{estimateId}`

Returns one editable estimate snapshot plus its linked customer/project identifiers, ordered
scope, base/alternate pricing, terms, and addenda rows; Phase 3 text and conditional-section
fields; canonical financial totals; audit timestamps; and `rowVersion`. The operation is read-only and organization-scoped. Missing and
cross-organization IDs both return `estimate_not_found` (404).

### `PUT /v1/estimates/{estimateId}`

Replaces the complete editable Phase 3 draft state. The request includes a canonical positive
integer-string `expectedRowVersion`, header/project snapshot fields, canonical deposit percent,
alternate and prevailing-wage inclusion, prevailing/lead-time/pricing-validity/notes fields, and
compact ordered scope, pricing, terms, and addenda arrays. Empty form rows are removed before the API
call. Monetary row values are signed integer strings in minor units.

The transaction locks and verifies the organization-owned estimate, refuses every non-draft,
checks optimistic concurrency, recalculates totals, updates the project/estimate, replaces scope,
pricing, terms, and addenda rows through controlled RLS-protected functions, appends
`estimate.draft_updated`, reloads the canonical detail, and commits. Failures roll back all
changes. `stale_estimate` and `estimate_not_editable` return 409.

## Numeric representation

- Every monetary API field is a canonical signed base-10 integer string in minor units, for
  example `"125050"` for $1,250.50. JSON numbers are rejected.
- Values must fit PostgreSQL signed `bigint`.
- Percentages are canonical non-negative decimal strings such as `"0"`, `"12.5"`, or
  `"100"`; JSON numbers and exponent notation are rejected at the API boundary.
- TypeScript converts money to `bigint` only after grammar/range validation and converts every
  result back with `.toString()` before JSON serialization.
- PostgreSQL stores money as `bigint` and percentages as exact `numeric`.
- Subtotal/total/deposit/balance rules and round-half-up behavior remain those in
  `lib/estimates/calculations.ts`. No authoritative floating-point money math is used.

The web form still accepts the desktop-compatible money and percentage formats. Its server action
normalizes those values to the stricter canonical API representation.

## Errors

Errors are non-sensitive and stable:

```json
{
  "error": {
    "code": "invalid_request",
    "message": "Deposit % must be between 0 and 100.",
    "requestId": "api-gateway-request-id",
    "fields": { "depositPercent": "Must be between 0 and 100." }
  }
}
```

Current codes include `authentication_required`, `active_membership_required`,
`invalid_json`, `invalid_request`, `idempotency_conflict`,
`estimate_not_found`, `estimate_not_editable`, `stale_estimate`,
`database_contract_error`, and `internal_error`. Unexpected database details are not returned.

Phase 4 also defines `estimate_incomplete`, `estimate_already_issued`,
`revision_requires_issued_estimate`, `revision_already_exists`,
`document_not_found`, `document_source_changed`,
`document_storage_conflict`, `document_storage_unavailable`, and
`document_finalize_pending`. Storage, SQL, credential, bucket, key, and signing
details are never included in error bodies.

## Authorization, deletion, and revisions

Owner, admin, and staff may list and create drafts. The API currently exposes no delete endpoint.
Customers, projects, and estimates have soft-delete fields; database triggers permit changes to
those fields only for owner/admin context. The runtime role has no physical-delete privilege.
Issued estimates and their child rows are immutable. Phase 4 creates a new draft
with `source_estimate_id` and an incremented `revision_number` instead of editing
an issued estimate.

## Phase 4 lifecycle and document routes

All write commands require a 16-200 character `Idempotency-Key` header using
letters, digits, `.`, `_`, `:`, or `-`.

### `POST /v1/estimates/{estimateId}/issue`

Explicitly validates and issues a complete draft. The response contains the
estimate ID, `issued` status, issue timestamp, next row version, and replay flag.
The issue transition and `estimate.issued` audit event commit in one transaction.

### `POST /v1/estimates/{estimateId}/duplicate`

Creates an independent revision-one draft on the same project, copies ordered
proposal content, clears the estimate number, and does not copy source linkage or
generated documents.

### `POST /v1/estimates/{estimateId}/revisions`

Creates the deterministic next draft from an issued estimate. The response
contains the new estimate ID, immediate source ID, draft status, revision number,
and replay flag.

### `POST /v1/estimates/{estimateId}/documents`

Accepts `{ "type": "docx" | "pdf" | "json" }`. The response exposes safe
document history metadata only. Generation reserves a pending row, stores to the
trusted organization key, then finalizes the row and audit event. See
[`estimate-phase-4.md`](./estimate-phase-4.md) for cross-service recovery.

### `GET /v1/estimates/{estimateId}/documents`

Returns organization-authorized document history in newest-first order. Bucket
names, object keys, version IDs, generator identities, and failure details are
not returned.

### `GET /v1/estimates/{estimateId}/documents/{documentId}/download`

Authorizes the estimate/document relationship and returns a five-minute
presigned attachment URL plus filename and expiry. Only `ready` rows are
downloadable. A caller cannot supply an S3 key.

## Infrastructure integration contract

`backend/estimates/index.ts` exports the handler factory and the `EstimateDatabase` contract.
`backend/shared/rds-data.ts` is the thin RDS Data API transaction adapter, and
`backend/runtime/estimate-handler.ts` is the stable Lambda entry point bundled by CDK. The
adapter begins a transaction and assumes the constrained `perfect_shade_app_runtime` database
role before application SQL. CDK owns only resource wiring and does not duplicate business logic.

The migration expects the account migration to provide:

- `app.organizations(id uuid)`;
- `app.organization_memberships(organization_id uuid, user_id text, role, status)`, where
  `user_id` is the immutable Cognito `sub`.

Those names are supplied by `0001_account_foundation.sql`. Account and estimate clients use the
same `NEXT_PUBLIC_API_BASE_URL` output and validated Cognito server session. No database secret,
organization identifier, role, or actor identifier is sent by the browser.
