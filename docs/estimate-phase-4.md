# Estimate Builder Phase 4

Phase 4 adds protected, server-side estimate output and the first controlled
estimate lifecycle. It preserves the Phase 1-3 editor, calculations, tenancy,
and preview behavior. It does not change the public website, deploy AWS
resources, or apply database migrations.

## Reference review

The desktop Perfect Shade Tool remains the output reference. Phase 4 reviewed:

- `app/document_generator.py`, `app/storage.py`, `app/models.py`,
  `app/settings.py`, `app/pdf_export.py`, and the output path helpers;
- desktop calculation, storage, document, generated-output, PDF, resource, and
  UI tests;
- `templates/perfect_shade_bid_template.docx` (SHA-256
  `1ede6197ec5cf1c1c117638aa8e38da29e2e9598d9b583c97f38e75c0b3f4050`);
- the two-page `v0.1_handoff_qa` DOCX/JSON output for Umatilla City Hall Roller
  Shades; and
- the two-page `pdf_export_qa_with_pdf` Word-exported PDF/DOCX/JSON output.

The retained desktop project was inspected read-only and remains unchanged.

## Desktop parity matrix

| Behavior | Desktop reference | Phase 4 web behavior |
| --- | --- | --- |
| DOCX | `docxtpl` renders the bundled template | A deterministic, AWS-compatible derived template is generated in Node.js |
| PDF | Microsoft Word COM exports the DOCX | A deterministic pure-JavaScript PDF renderer; no Word, Office, or hosted converter |
| JSON | `BidData.to_dict()`, decimal strings, local output settings included | Versioned stable export; decimal-safe money strings; excludes workstation and infrastructure settings |
| Section order | Project, scope, addenda, pricing, alternates, terms, additional terms, wage, measurement, warranty, qualifications, notes, acceptance | Preserved |
| Addenda | Hidden when empty | Preserved |
| Alternates | Shown only when enabled and non-empty; excluded from main total | Preserved |
| Additional terms | Hidden when empty | Preserved |
| Prevailing Wage | Shown only when enabled and text is present | Preserved |
| Project notes | Hidden when empty | Preserved |
| Measurement Readiness | Constant approved wording | Preserved exactly |
| Craftsmanship Warranty | Constant approved wording | Preserved exactly |
| Company Qualifications | Constant approved wording | Preserved exactly |
| Retainage | Constant five-percent maximum term | Preserved exactly |
| Sales tax | Always zero in totals; notice remains a term | Preserved |
| Filename | Current date, project name, `Perfect Shade Bid`, then `(2)`, `(3)` for local collisions | Same readable core; bounded sanitization; unique document ID makes the S3 key collision-safe without probing filenames |
| Output history | Local files only | Organization-authorized immutable history records for ready outputs |
| Draft/issued label | No lifecycle status | Explicit `DRAFT` or `ISSUED`, plus revision metadata |
| Signature | Fixed Sheri Brannan signature image and acceptance block | The exact verified signature asset is supported in DOCX/PDF and is approved for development-generated client documents through `ESTIMATE_INCLUDE_COMPANY_SIGNATURE=true` |

### Intentional web differences

- Web PDF creation does not depend on Microsoft Word and is generated directly
  from the same presentation model as DOCX/JSON.
- Web filenames have a 120-character sanitized project component and reject
  control characters, path separators, dot segments, and reserved Windows
  device names. S3 keys are never based on an untrusted organization path.
- S3 object uniqueness comes from the generated document UUID. A user-visible
  filename remains deterministic and can repeat safely because the object key
  cannot collide.
- Desktop JSON contains `create_docx`, `create_pdf`, and `output_folder`. Those
  workstation-only settings are intentionally absent from the web export.
- The web export adds schema, estimate, revision, status, and generation
  metadata suitable for future import tooling, but excludes organization IDs,
  actor IDs, row versions, S3 keys, credentials, and audit metadata.
- The exact desktop signature bytes are bundled only with the protected estimate
  Lambda. The owner approved `ESTIMATE_INCLUDE_COMPANY_SIGNATURE=true` for the
  development environment on 2026-08-18. No public route imports the asset and
  no user-entered signer is substituted for Sheri's signature. Production remains
  a separate deployment decision.

## Shared presentation model

DOCX, PDF, and JSON are generated only from a canonical `EstimateDetail` loaded
after the authenticated Cognito subject is resolved to one active organization
membership. A pure presentation builder supplies:

- display-safe project and proposal fields;
- ordered scope, pricing, alternate, term, and addenda rows;
- authoritative stored totals and decimal-safe display strings;
- conditional-section visibility;
- the approved constant terms and company wording; and
- draft/issued and revision labels.

No generator receives a caller-provided organization ID, bucket key, actor ID,
row version, or audit payload.

## DOCX architecture

The web DOCX renderer uses the pure-JavaScript `docx` package and a derived
template matching the desktop's letter page, blue/white visual hierarchy,
two-column bid information, pricing tables, ordered sections, footer, and
acceptance block. It runs in Node.js 22 on Lambda and does not launch a browser,
Word, LibreOffice, or a remote conversion service.

The derived template is code-owned so generation is deterministic and can be
unit-tested without filesystem or Office dependencies. Package validity is
verified as OOXML/ZIP, and generated samples are rendered during development
QA.

## PDF architecture

The web PDF renderer uses `pdf-lib`, embedded standard fonts, deterministic
layout primitives, repeated page margins/footer, table row pagination, and the
same presentation model as DOCX. It requires no native executable or external
network service, making it suitable for the existing Node.js 22 ARM64 Lambda.

The PDF is a client-deliverable proposal rather than a DOCX conversion. Content
parity is authoritative; small font, pagination, and signature-image differences
from Word's layout are intentional and documented.

## JSON export schema

The media type is `application/json` and the schema identifier is
`perfect-shade-estimate-export/v1`. UTF-8 output is stable and ends with a
newline. Object keys are emitted in the documented generator order.

Money is represented by canonical decimal strings with exactly two fractional
digits, never JavaScript numbers or JSON bigint values. Percentages remain
canonical decimal strings. The export contains:

- schema identifier and generated timestamp;
- estimate document type, number, date fields, status, and revision number;
- customer display name and project snapshot fields;
- ordered scope, base pricing, alternate pricing, terms, and addenda;
- alternate and prevailing-wage inclusion flags and text;
- lead time, pricing validity, project notes;
- subtotal, zero sales tax, total, deposit, balance, and separate alternate
  total; and
- approved constant wording needed to reconstruct a proposal.

It deliberately contains no tenant identifiers, Cognito subjects, database
identifiers, row versions, S3 metadata, API configuration, credentials, or audit
records.

## S3 object model

The existing private, encrypted, versioned document bucket is used. The backend
derives this key and never accepts it from a caller:

```text
organizations/{organizationId}/estimates/{estimateId}/revisions/{revision}/documents/{documentId}.{type}
```

The trusted organization ID comes from database membership context. Object
metadata contains only the estimate ID, revision, document ID, output type, and
SHA-256 checksum. It does not contain an actor ID or customer content.

Downloads are authorized by an organization-scoped metadata lookup, then a
trusted backend issues a 300-second presigned `GetObject` URL with an attachment
filename. API responses do not expose the bucket or raw object key.

## Document metadata and cross-service recovery

Migration `0007_estimate_phase_4.sql` adds `app.estimate_documents`. Each row
tracks document ID, organization/estimate/revision, type, state, trusted object
key, original filename, content type, byte size, SHA-256, S3 version ID, source
row version, idempotency key, generator version, generator identity, and
timestamps.

Aurora and S3 cannot share a transaction, so generation uses an explicit state
machine:

1. An Aurora transaction resolves membership, loads canonical estimate data,
   and reserves a `pending` document row under an idempotency key.
2. The server generates bytes and uploads the UUID-scoped object with a
   checksum.
3. A second Aurora transaction locks the reservation, verifies the same tenant,
   estimate, type, checksum, and row state, marks it `ready`, and appends the
   audit event.
4. An upload failure marks the reservation `failed` with a secret-safe failure
   code. It is never presented as downloadable.
5. If upload succeeds but database finalization fails, the row remains
   `pending`. Replaying the same idempotency key reuses the same document ID and
   key, verifies the object checksum, and finalizes it. No delete permission is
   required.

Ready and failed document records are immutable. The runtime receives no table
delete privilege and no S3 delete permission.

## Issue workflow

`POST /v1/estimates/{estimateId}/issue` is an explicit idempotent command.
Owner, admin, and staff are allowed by the established operational policy.

Inside one Aurora transaction the service:

1. resolves and establishes the caller's active membership context;
2. locks the organization-scoped estimate;
3. requires `draft` status;
4. validates desktop-required project name, architect/prepared-for value, at
   least one base pricing row, and any enabled conditional pricing/wage content;
5. sets `status = 'issued'`, `issued_at`, `issued_by`, and audit fields; and
6. appends `estimate.issued` and completes the idempotency record before commit.

The existing database triggers then reject updates or deletes to the issued
estimate and its content rows. Preview or document generation never issues an
estimate implicitly.

## Revision workflow

`POST /v1/estimates/{estimateId}/revisions` accepts only an issued estimate. In
one transaction it locks that source, allocates `source.revision_number + 1`,
creates a new draft linked through `source_estimate_id`, copies all editable
snapshot fields and ordered child rows, appends `estimate.revision_created`, and
completes idempotency.

`source_estimate_id` is the immediate issued predecessor. The source remains
immutable. The new draft has a new ID, row version 1, no issue fields, and no
document records. A uniqueness constraint prevents two competing next
revisions from the same source.

## Duplication workflow

`POST /v1/estimates/{estimateId}/duplicate` accepts an accessible draft or
issued estimate. It copies proposal fields and ordered rows into a new,
independent draft on the same project, with `revision_number = 1`, no source
link, no issue fields, and a blank estimate number. It appends
`estimate.duplicated`. Generated-document metadata is never copied.

The project relationship is retained intentionally: duplication copies an
estimate for the same protected project, not a customer or project record.

## Status model

Phase 4 UI and commands use these transitions:

```text
draft --issue--> issued --create revision--> new draft revision
  |                    |
  +--duplicate-->      +--duplicate-->
       independent draft   independent draft
```

Only `draft` is editable. `issued` is immutable. Existing schema values
`accepted`, `declined`, `expired`, and `void` remain reserved for future
workflows; Phase 4 adds no transitions to them.

## API surface and stable handler entry points

- `POST /v1/estimates/{estimateId}/documents`
- `GET /v1/estimates/{estimateId}/documents`
- `GET /v1/estimates/{estimateId}/documents/{documentId}/download`
- `POST /v1/estimates/{estimateId}/issue`
- `POST /v1/estimates/{estimateId}/duplicate`
- `POST /v1/estimates/{estimateId}/revisions`

Writes require the existing `Idempotency-Key` header. All routes use Cognito JWT
claims, database-resolved active membership, explicit organization predicates,
forced RLS, secret-safe errors, and no caller-controlled tenant path.

Chat 5 must add these route keys to API Gateway and confirm Lambda S3
`PutObject`, `GetObject`, `HeadObject`, and presigning permissions. Phase 4 does
not change CDK or deploy them.

## Security boundaries

- Organization access is resolved server-side and repeated in every estimate
  and document query; cross-tenant IDs return the same not-found response.
- Only server-derived keys are passed to the S3 adapter.
- Output bytes omit internal tenancy, actor, optimistic-lock, infrastructure,
  and audit metadata.
- Presigned links expire after five minutes and are created only after a fresh
  authorization check.
- Issue, duplicate, revision, and document reservation/finalization are audited
  and idempotent.
- Existing forced RLS, restricted runtime grants, child-row controls, and
  append-only audit history remain intact.

## Deferred work

- customer e-signature/acceptance, payment, email delivery, accepted/declined/
  expired/void transitions, and customer portal access;
- any future signer administration or replacement of the approved bundled asset;
- document regeneration jobs/queues for very large proposals;
- customer/project management UX beyond the current estimate-owned workflow;
- production retention/legal-hold policy; and
- Chat 5 CDK route, IAM, Lambda bundle, environment, deployment, and live
  migration work.
