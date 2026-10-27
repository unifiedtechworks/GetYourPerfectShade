# Estimate issuance, document history, signature dates, and lead times

This change separates estimate lifecycle from generated-file state and adopts
proposal wording policy v2 without changing historical issued commitments.

## Production evidence and diagnosis

A read-only metadata check for the reported October 27, 2026 PDF found that it
was rendered at 2:35:05 PM Pacific and the estimate was issued at 2:35:31 PM
Pacific. The PDF was therefore generated from revision 1 while it was still a
draft. Its `DRAFT · Revision 1` content is correct and must not be relabeled or
overwritten. A newly generated file from that issued revision is expected to be
`ISSUED · Revision 1`.

The prior source also had a distinct concurrency gap: it rendered before
reserving document history and did not lock or revalidate the estimate row.
Issuance could therefore commit between rendering and reservation. The new
reservation flow checks an existing idempotent reservation first, then locks the
estimate and requires the current status, revision, row version, and issued
timestamp to match the rendered source before inserting history. A mismatch
fails before S3 storage and requires a fresh request.

## Lifecycle controls

Document generation never issues, duplicates, revises, or overwrites an
estimate. The protected UI now states:

- a draft generation remains labeled `DRAFT` after later issuance;
- **Issue estimate** is a separate explicit operation that freezes the revision;
- a new generation from the frozen revision creates an `ISSUED` file; and
- earlier draft files remain unchanged.

The generated-document table separates **Generated As** (`Draft`, `Issued`, or
`Unknown (legacy)`) from **File State** (`Pending`, `Ready`, or `Failed`).

## Durable document lifecycle snapshot

Migration `0010_estimate_document_lifecycle_and_policy.sql` adds nullable
`app.estimate_documents.generated_as`. Null is intentionally reserved for
pre-migration records whose original state is not independently known. Every
new insert must supply `draft` or `issued`; the value is immutable after insert.
Idempotent replays read the original reservation and cannot replace its
lifecycle snapshot with the estimate's later status.

Historical records are never inferred from the parent estimate's current
status. A legacy row may be classified only when immutable artifact content or
audited evidence proves the original state. Use an administrative/migration
identity that is authorized to bypass the table's forced RLS, an explicit
document ID, and the stored exact SHA-256 checksum in one controlled
transaction. Set a non-secret administrative audit label so the existing audit
trigger records who performed the classification:

```sql
begin;

select set_config('app.actor_id', '<approved-administrative-audit-label>', true);

select id, generated_as, checksum_sha256, state
from app.estimate_documents
where id = '<document-uuid>'::uuid
for update;

update app.estimate_documents
set generated_as = '<draft-or-issued>'
where id = '<document-uuid>'::uuid
  and generated_as is null
  and checksum_sha256 = '<verified-exact-sha256>'
returning id, generated_as, checksum_sha256;

-- Commit only when exactly one returned row matches the independently verified
-- artifact or audit evidence. Otherwise roll back and retain Unknown (legacy).
commit;
```

This is a one-way classification. The application runtime cannot update ready
or failed history through RLS, and a non-null `generated_as` cannot be changed.
No historical S3 object is downloaded, regenerated, replaced, or renamed by
migration 0010.

## Signature date

The company signature date is derived only from persisted `issuedAt`, formatted
as `MM/DD/YYYY` in `America/Los_Angeles`. Drafts, missing timestamps, and invalid
timestamps leave it blank. The customer date always remains blank. Regeneration
therefore preserves the original issuance date rather than using Prepared date,
generation time, or current time. Browser preview, DOCX, and PDF share the same
formatter and retain the approved private Sheri signature asset behavior.

## Proposal wording policy

Migration 0010 adds immutable `app.estimates.proposal_policy_version`:

- every existing estimate receives version 1 through the add-column default;
- the column default immediately changes to version 2 for new estimates; and
- new independent duplicates and revisions also use version 2 because their
  insert statements intentionally use the database default.

Version 1 continues to render the saved `lead_time` value in the legacy Terms
sentence. Version 2 omits that sentence and renders this permanent section,
immediately before Measurement Readiness:

> **Lead Times**
>
> - Lead time will be 3 weeks from final measure and receipt of deposit.

The editor keeps the historical value in a hidden form field so saving an older
draft does not erase it, but no longer offers an editable Estimated Lead Time
control. The historical database column is not dropped.

## Coordinated rollout

Migration 0010 is forward-only and remains unapplied in this source task.
Because old Lambda code does not supply `generated_as` and new Lambda code reads
the new columns, use a controlled change window:

1. Integrate and verify this source commit; preserve migration checksums
   0001–0009.
2. Temporarily prevent users from starting document generation.
3. Apply migration 0010 with the administrative migration identity.
4. Deploy the Estimate Lambda/API immediately after the migration.
5. Deploy the Amplify frontend so the new controls and history columns appear.
6. Run draft and issued smoke generations, verify Generated As/File State,
   signature date, Lead Times, downloads, and tenant authorization.
7. Re-enable normal document generation.

For a destination AWS account or region, include 0010 in deterministic order
after 0001–0009 and apply all required migrations before enabling the new
Estimate Lambda. Do not deploy infrastructure with the new application contract
against a database that stops at migration 0009.
