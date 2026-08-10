import { createHash, randomUUID } from "node:crypto";
import type {
  CopyEstimateResponse,
  EstimateDocumentDownloadResponse,
  EstimateDocumentRecord,
  EstimateDocumentType,
  GenerateEstimateDocumentResponse,
  IssueEstimateResponse,
  ListEstimateDocumentsResponse,
} from "../../lib/aws/api/estimate-contracts";
import {
  buildEstimateDocumentKey,
  ESTIMATE_DOCUMENT_GENERATOR_VERSION,
  ESTIMATE_DOWNLOAD_TTL_SECONDS,
  generateEstimateDocument,
  type GeneratedEstimateDocument,
} from "../../lib/estimates/document-output";
import type { EstimateDatabase, SqlRow } from "./database";
import { parameters } from "./database";
import type { EstimateDocumentStorage } from "./document-storage";
import { EstimateServiceError } from "./errors";
import { EstimateService } from "./service";

type Membership = Readonly<{
  actorId: string;
  organizationId: string;
  role: "owner" | "admin" | "staff";
}>;

const ESTABLISH_CONTEXT_SQL = `
select actor_id, organization_id::text, role
from app_private.establish_estimate_context(:subject)
`;

const INSERT_COMMAND_SQL = `
insert into app.estimate_command_idempotency (
  organization_id, command_name, idempotency_key, request_hash,
  created_by, updated_by
) values (
  :organizationId::uuid, :commandName, :idempotencyKey, :requestHash,
  :actorId, :actorId
)
on conflict (organization_id, command_name, idempotency_key) do nothing
returning id::text
`;

const SELECT_COMMAND_SQL = `
select request_hash, estimate_id::text, result_id::text
from app.estimate_command_idempotency
where organization_id = :organizationId::uuid
  and command_name = :commandName
  and idempotency_key = :idempotencyKey
`;

const COMPLETE_COMMAND_SQL = `
update app.estimate_command_idempotency
set estimate_id = :resultEstimateId::uuid,
    result_id = :resultId::uuid,
    updated_by = :actorId
where organization_id = :organizationId::uuid
  and command_name = :commandName
  and idempotency_key = :idempotencyKey
`;

const LOCK_ESTIMATE_SQL = `
select id::text, project_id::text, status, revision_number::text,
       row_version::text, project_name, prepared_for,
       include_alternate_pricing::text,
       include_prevailing_wage_statement::text,
       prevailing_wage_statement, issued_at::text
from app.estimates
where organization_id = :organizationId::uuid
  and id = :estimateId::uuid
  and deleted_at is null
for update
`;

const ISSUE_COUNTS_SQL = `
select
  count(*) filter (where kind = 'base')::text as base_count,
  count(*) filter (where kind = 'alternate')::text as alternate_count
from app.estimate_pricing_lines
where organization_id = :organizationId::uuid
  and estimate_id = :estimateId::uuid
`;

const ISSUE_ESTIMATE_SQL = `
update app.estimates
set status = 'issued', issued_at = now(), issued_by = :actorId,
    updated_by = :actorId
where organization_id = :organizationId::uuid
  and id = :estimateId::uuid
  and status = 'draft'
  and deleted_at is null
returning issued_at::text, row_version::text
`;

const SELECT_ISSUE_RESULT_SQL = `
select status, issued_at::text, row_version::text
from app.estimates
where organization_id = :organizationId::uuid
  and id = :estimateId::uuid
  and deleted_at is null
`;

const INSERT_AUDIT_SQL = `
insert into app.audit_events (
  id, organization_id, actor_id, action, entity_type, entity_id,
  request_id, metadata, created_by, updated_by
) values (
  :auditEventId::uuid, :organizationId::uuid, :actorId, :action,
  :entityType, :entityId::uuid, :requestId, :metadata::jsonb,
  :actorId, :actorId
)
`;

const INSERT_DUPLICATE_SQL = `
insert into app.estimates (
  id, organization_id, project_id, source_estimate_id, revision_number,
  status, document_type, estimate_number, estimate_date, valid_through,
  bid_due, project_name, project_location, prepared_for, contact_information,
  deposit_percent, tax_rate_percent, include_alternate_pricing,
  include_prevailing_wage_statement, prevailing_wage_statement, lead_time,
  pricing_valid_days, project_notes, authorized_signer, signature_date,
  subtotal_minor, sales_tax_minor, total_minor, required_deposit_minor,
  remaining_balance_minor, created_by, updated_by
)
select :newEstimateId::uuid, e.organization_id, e.project_id, null, 1,
       'draft', e.document_type, '', e.estimate_date, e.valid_through,
       e.bid_due, e.project_name, e.project_location, e.prepared_for,
       e.contact_information, e.deposit_percent, e.tax_rate_percent,
       e.include_alternate_pricing, e.include_prevailing_wage_statement,
       e.prevailing_wage_statement, e.lead_time, e.pricing_valid_days,
       e.project_notes, e.authorized_signer, e.signature_date,
       e.subtotal_minor, e.sales_tax_minor, e.total_minor,
       e.required_deposit_minor, e.remaining_balance_minor, :actorId, :actorId
from app.estimates e
where e.organization_id = :organizationId::uuid
  and e.id = :estimateId::uuid
  and e.deleted_at is null
`;

const INSERT_REVISION_SQL = `
insert into app.estimates (
  id, organization_id, project_id, source_estimate_id, revision_number,
  status, document_type, estimate_number, estimate_date, valid_through,
  bid_due, project_name, project_location, prepared_for, contact_information,
  deposit_percent, tax_rate_percent, include_alternate_pricing,
  include_prevailing_wage_statement, prevailing_wage_statement, lead_time,
  pricing_valid_days, project_notes, authorized_signer, signature_date,
  subtotal_minor, sales_tax_minor, total_minor, required_deposit_minor,
  remaining_balance_minor, created_by, updated_by
)
select :newEstimateId::uuid, e.organization_id, e.project_id, e.id,
       :newRevision::integer, 'draft', e.document_type, e.estimate_number,
       e.estimate_date, e.valid_through, e.bid_due, e.project_name,
       e.project_location, e.prepared_for, e.contact_information,
       e.deposit_percent, e.tax_rate_percent, e.include_alternate_pricing,
       e.include_prevailing_wage_statement, e.prevailing_wage_statement,
       e.lead_time, e.pricing_valid_days, e.project_notes,
       e.authorized_signer, e.signature_date, e.subtotal_minor,
       e.sales_tax_minor, e.total_minor, e.required_deposit_minor,
       e.remaining_balance_minor, :actorId, :actorId
from app.estimates e
where e.organization_id = :organizationId::uuid
  and e.id = :estimateId::uuid
  and e.status = 'issued'
  and e.deleted_at is null
`;

const SELECT_EXISTING_REVISION_SQL = `
select id::text
from app.estimates
where organization_id = :organizationId::uuid
  and source_estimate_id = :estimateId::uuid
  and revision_number = :newRevision::integer
  and deleted_at is null
`;

const COPY_SCOPE_SQL = `
insert into app.estimate_scope_items (
  id, organization_id, estimate_id, sort_order, description,
  created_by, updated_by
)
select gen_random_uuid(), organization_id, :newEstimateId::uuid,
       sort_order, description, :actorId, :actorId
from app.estimate_scope_items
where organization_id = :organizationId::uuid
  and estimate_id = :estimateId::uuid
order by sort_order
`;

const COPY_PRICING_SQL = `
insert into app.estimate_pricing_lines (
  id, organization_id, estimate_id, kind, sort_order, description,
  amount_minor, created_by, updated_by
)
select gen_random_uuid(), organization_id, :newEstimateId::uuid,
       kind, sort_order, description, amount_minor, :actorId, :actorId
from app.estimate_pricing_lines
where organization_id = :organizationId::uuid
  and estimate_id = :estimateId::uuid
order by kind, sort_order
`;

const COPY_TERMS_SQL = `
insert into app.estimate_terms (
  id, organization_id, estimate_id, sort_order, description,
  created_by, updated_by
)
select gen_random_uuid(), organization_id, :newEstimateId::uuid,
       sort_order, description, :actorId, :actorId
from app.estimate_terms
where organization_id = :organizationId::uuid
  and estimate_id = :estimateId::uuid
order by sort_order
`;

const COPY_ADDENDA_SQL = `
insert into app.estimate_addenda (
  id, organization_id, estimate_id, sort_order, description,
  created_by, updated_by
)
select gen_random_uuid(), organization_id, :newEstimateId::uuid,
       sort_order, description, :actorId, :actorId
from app.estimate_addenda
where organization_id = :organizationId::uuid
  and estimate_id = :estimateId::uuid
order by sort_order
`;

const INSERT_DOCUMENT_SQL = `
insert into app.estimate_documents (
  id, organization_id, estimate_id, estimate_revision, document_type,
  state, object_key, original_filename, content_type, byte_size,
  checksum_sha256, source_row_version, idempotency_key, generator_version,
  generated_by, rendered_at, created_by, updated_by
) values (
  :documentId::uuid, :organizationId::uuid, :estimateId::uuid,
  :revision::integer, :documentType, 'pending', :objectKey,
  :filename, :contentType, :byteSize::bigint, :checksumSha256,
  :sourceRowVersion::bigint, :idempotencyKey, :generatorVersion,
  :actorId, :renderedAt::timestamptz, :actorId, :actorId
)
on conflict (organization_id, estimate_id, document_type, idempotency_key)
do nothing
returning id::text, estimate_id::text, estimate_revision::text, document_type,
          state, object_key, original_filename, content_type, byte_size::text,
          checksum_sha256, source_row_version::text, rendered_at::text,
          generated_at::text, created_at::text
`;

const SELECT_DOCUMENT_RESERVATION_SQL = `
select id::text, estimate_id::text, estimate_revision::text, document_type,
       state, object_key, original_filename, content_type, byte_size::text,
       checksum_sha256, source_row_version::text, rendered_at::text,
       generated_at::text, created_at::text
from app.estimate_documents
where organization_id = :organizationId::uuid
  and estimate_id = :estimateId::uuid
  and document_type = :documentType
  and idempotency_key = :idempotencyKey
`;

const FINALIZE_DOCUMENT_SQL = `
update app.estimate_documents
set state = 'ready', byte_size = :byteSize::bigint,
    checksum_sha256 = :checksumSha256,
    object_version_id = nullif(:objectVersionId, ''),
    generated_at = rendered_at, updated_by = :actorId
where organization_id = :organizationId::uuid
  and id = :documentId::uuid
  and estimate_id = :estimateId::uuid
  and state = 'pending'
returning id::text, estimate_id::text, estimate_revision::text, document_type,
          state, original_filename, content_type, byte_size::text,
          checksum_sha256, generated_at::text, created_at::text
`;

const FAIL_DOCUMENT_SQL = `
update app.estimate_documents
set state = 'failed', failure_code = :failureCode, updated_by = :actorId
where organization_id = :organizationId::uuid
  and id = :documentId::uuid
  and estimate_id = :estimateId::uuid
  and state = 'pending'
`;

const LIST_DOCUMENTS_SQL = `
select id::text, estimate_id::text, estimate_revision::text, document_type,
       state, original_filename, content_type, byte_size::text,
       checksum_sha256, generated_at::text, created_at::text
from app.estimate_documents
where organization_id = :organizationId::uuid
  and estimate_id = :estimateId::uuid
order by created_at desc, id desc
`;

const DOWNLOAD_DOCUMENT_SQL = `
select id::text, original_filename, content_type, object_key
from app.estimate_documents
where organization_id = :organizationId::uuid
  and estimate_id = :estimateId::uuid
  and id = :documentId::uuid
  and state = 'ready'
`;

function required(row: SqlRow, field: string): string {
  const value = row[field];
  if (value === null || value === undefined || value === "") {
    throw new EstimateServiceError(
      "database_contract_error",
      "The estimate data contract is invalid.",
      500,
    );
  }
  return value;
}

function bool(row: SqlRow, field: string): boolean {
  const value = required(row, field);
  if (value === "true") return true;
  if (value === "false") return false;
  throw new EstimateServiceError("database_contract_error", "The estimate data contract is invalid.", 500);
}

function requestHash(command: string, estimateId: string): string {
  return createHash("sha256").update(JSON.stringify([command, estimateId])).digest("hex");
}

function documentRecord(row: SqlRow): EstimateDocumentRecord {
  return {
    id: required(row, "id"),
    estimateId: required(row, "estimate_id"),
    revisionNumber: required(row, "estimate_revision"),
    type: required(row, "document_type") as EstimateDocumentType,
    state: required(row, "state") as EstimateDocumentRecord["state"],
    filename: required(row, "original_filename"),
    contentType: required(row, "content_type"),
    byteSize: row.byte_size ?? null,
    checksumSha256: row.checksum_sha256 ?? null,
    generatedAt: row.generated_at ?? null,
    createdAt: required(row, "created_at"),
  };
}

export class EstimatePhase4Service {
  constructor(
    private readonly database: EstimateDatabase,
    private readonly storage: EstimateDocumentStorage,
    private readonly idFactory: () => string = randomUUID,
    private readonly clock: () => Date = () => new Date(),
    private readonly generator: (
      estimate: Parameters<typeof generateEstimateDocument>[0],
      type: EstimateDocumentType,
      generatedAt: Date,
    ) => Promise<GeneratedEstimateDocument> = generateEstimateDocument,
  ) {}

  private async establishContext(transactionId: string, subject: string): Promise<Membership> {
    const rows = await this.database.execute({
      sql: ESTABLISH_CONTEXT_SQL,
      parameters: parameters({ subject }),
      transactionId,
    });
    if (rows.length !== 1) {
      throw new EstimateServiceError("active_membership_required", "An active organization membership is required.", 403);
    }
    const role = required(rows[0], "role");
    if (!["owner", "admin", "staff"].includes(role)) {
      throw new EstimateServiceError("active_membership_required", "An active organization membership is required.", 403);
    }
    return {
      actorId: required(rows[0], "actor_id"),
      organizationId: required(rows[0], "organization_id"),
      role: role as Membership["role"],
    };
  }

  private async rollback(transactionId: string) {
    try { await this.database.rollbackTransaction(transactionId); } catch { /* preserve original */ }
  }

  private async reserveCommand(
    transactionId: string,
    membership: Membership,
    commandName: string,
    estimateId: string,
    idempotencyKey: string,
  ): Promise<string | null> {
    const hash = requestHash(commandName, estimateId);
    const common = {
      organizationId: membership.organizationId,
      actorId: membership.actorId,
      commandName,
      idempotencyKey,
      requestHash: hash,
    };
    const inserted = await this.database.execute({
      sql: INSERT_COMMAND_SQL,
      parameters: parameters(common),
      transactionId,
    });
    if (inserted.length > 0) return null;
    const existing = await this.database.execute({
      sql: SELECT_COMMAND_SQL,
      parameters: parameters(common),
      transactionId,
    });
    if (existing.length !== 1 || required(existing[0], "request_hash") !== hash) {
      throw new EstimateServiceError("idempotency_conflict", "That idempotency key was already used for another request.", 409);
    }
    return required(existing[0], "estimate_id");
  }

  private async completeCommand(
    transactionId: string,
    membership: Membership,
    commandName: string,
    idempotencyKey: string,
    resultEstimateId: string,
  ) {
    await this.database.execute({
      sql: COMPLETE_COMMAND_SQL,
      parameters: parameters({
        organizationId: membership.organizationId,
        actorId: membership.actorId,
        commandName,
        idempotencyKey,
        resultEstimateId,
        resultId: resultEstimateId,
      }),
      transactionId,
    });
  }

  private async audit(
    transactionId: string,
    membership: Membership,
    action: string,
    entityType: string,
    entityId: string,
    requestId: string,
    metadata: unknown,
  ) {
    await this.database.execute({
      sql: INSERT_AUDIT_SQL,
      parameters: parameters({
        organizationId: membership.organizationId,
        actorId: membership.actorId,
        auditEventId: this.idFactory(),
        action,
        entityType,
        entityId,
        requestId,
        metadata: JSON.stringify(metadata),
      }),
      transactionId,
    });
  }

  async issue(
    subject: string,
    estimateId: string,
    idempotencyKey: string,
    requestId: string,
  ): Promise<IssueEstimateResponse> {
    const transactionId = await this.database.beginTransaction();
    try {
      const membership = await this.establishContext(transactionId, subject);
      const replayEstimateId = await this.reserveCommand(
        transactionId, membership, "issue_estimate", estimateId, idempotencyKey,
      );
      if (replayEstimateId) {
        const result = await this.database.execute({
          sql: SELECT_ISSUE_RESULT_SQL,
          parameters: parameters({ organizationId: membership.organizationId, estimateId: replayEstimateId }),
          transactionId,
        });
        if (result.length !== 1 || required(result[0], "status") !== "issued") {
          throw new EstimateServiceError("idempotency_incomplete", "The prior issue request did not complete.", 409);
        }
        await this.database.commitTransaction(transactionId);
        return { data: {
          estimateId: replayEstimateId,
          status: "issued",
          issuedAt: required(result[0], "issued_at"),
          rowVersion: required(result[0], "row_version"),
          replayed: true,
        } };
      }
      const locked = await this.database.execute({
        sql: LOCK_ESTIMATE_SQL,
        parameters: parameters({ organizationId: membership.organizationId, estimateId }),
        transactionId,
      });
      if (locked.length !== 1) {
        throw new EstimateServiceError("estimate_not_found", "The estimate was not found.", 404);
      }
      const row = locked[0];
      if (required(row, "status") !== "draft") {
        throw new EstimateServiceError("estimate_already_issued", "Only a current draft can be issued.", 409);
      }
      const counts = await this.database.execute({
        sql: ISSUE_COUNTS_SQL,
        parameters: parameters({ organizationId: membership.organizationId, estimateId }),
        transactionId,
      });
      const fields: Record<string, string> = {};
      if (!required(row, "project_name").trim()) fields.projectName = "Project Name is required.";
      if (!required(row, "prepared_for").trim()) fields.preparedFor = "Architect is required.";
      if (counts.length !== 1 || Number(required(counts[0], "base_count")) < 1) {
        fields.pricingLines = "At least one pricing line is required.";
      }
      if (bool(row, "include_alternate_pricing") && Number(required(counts[0], "alternate_count")) < 1) {
        fields.alternatePricingLines = "Enabled alternate pricing requires at least one line.";
      }
      if (bool(row, "include_prevailing_wage_statement") && !required(row, "prevailing_wage_statement").trim()) {
        fields.prevailingWageStatement = "Prevailing Wage wording is required when enabled.";
      }
      if (Object.keys(fields).length > 0) {
        throw new EstimateServiceError("estimate_incomplete", "Complete the estimate before issuing it.", 400, fields);
      }
      const issued = await this.database.execute({
        sql: ISSUE_ESTIMATE_SQL,
        parameters: parameters({ organizationId: membership.organizationId, actorId: membership.actorId, estimateId }),
        transactionId,
      });
      if (issued.length !== 1) {
        throw new EstimateServiceError("estimate_already_issued", "Only a current draft can be issued.", 409);
      }
      const issuedAt = required(issued[0], "issued_at");
      const rowVersion = required(issued[0], "row_version");
      await this.audit(transactionId, membership, "estimate.issued", "estimate", estimateId, requestId, {
        revisionNumber: required(row, "revision_number"),
        previousRowVersion: required(row, "row_version"),
        rowVersion,
      });
      await this.completeCommand(transactionId, membership, "issue_estimate", idempotencyKey, estimateId);
      await this.database.commitTransaction(transactionId);
      return { data: { estimateId, status: "issued", issuedAt, rowVersion, replayed: false } };
    } catch (error) {
      await this.rollback(transactionId);
      throw error;
    }
  }

  private async copy(
    mode: "duplicate" | "revision",
    subject: string,
    estimateId: string,
    idempotencyKey: string,
    requestId: string,
  ): Promise<CopyEstimateResponse> {
    const commandName = mode === "duplicate" ? "duplicate_estimate" : "create_estimate_revision";
    const transactionId = await this.database.beginTransaction();
    try {
      const membership = await this.establishContext(transactionId, subject);
      const replayEstimateId = await this.reserveCommand(
        transactionId, membership, commandName, estimateId, idempotencyKey,
      );
      if (replayEstimateId) {
        const result = await this.database.execute({
          sql: LOCK_ESTIMATE_SQL,
          parameters: parameters({ organizationId: membership.organizationId, estimateId: replayEstimateId }),
          transactionId,
        });
        if (result.length !== 1) throw new EstimateServiceError("idempotency_incomplete", "The prior copy request did not complete.", 409);
        await this.database.commitTransaction(transactionId);
        return { data: {
          estimateId: replayEstimateId,
          sourceEstimateId: mode === "revision" ? estimateId : null,
          status: "draft",
          revisionNumber: required(result[0], "revision_number"),
          replayed: true,
        } };
      }
      const sourceRows = await this.database.execute({
        sql: LOCK_ESTIMATE_SQL,
        parameters: parameters({ organizationId: membership.organizationId, estimateId }),
        transactionId,
      });
      if (sourceRows.length !== 1) throw new EstimateServiceError("estimate_not_found", "The estimate was not found.", 404);
      const source = sourceRows[0];
      if (mode === "revision" && required(source, "status") !== "issued") {
        throw new EstimateServiceError("revision_requires_issued_estimate", "Only an issued estimate can start a revision.", 409);
      }
      const revisionNumber = mode === "revision"
        ? String(Number(required(source, "revision_number")) + 1)
        : "1";
      if (mode === "revision") {
        const existing = await this.database.execute({
          sql: SELECT_EXISTING_REVISION_SQL,
          parameters: parameters({ organizationId: membership.organizationId, estimateId, newRevision: revisionNumber }),
          transactionId,
        });
        if (existing.length > 0) {
          throw new EstimateServiceError("revision_already_exists", "A next revision already exists for this estimate.", 409);
        }
      }
      const newEstimateId = this.idFactory();
      await this.database.execute({
        sql: mode === "revision" ? INSERT_REVISION_SQL : INSERT_DUPLICATE_SQL,
        parameters: parameters({
          organizationId: membership.organizationId,
          actorId: membership.actorId,
          estimateId,
          newEstimateId,
          newRevision: revisionNumber,
        }),
        transactionId,
      });
      for (const sql of [COPY_SCOPE_SQL, COPY_PRICING_SQL, COPY_TERMS_SQL, COPY_ADDENDA_SQL]) {
        await this.database.execute({
          sql,
          parameters: parameters({
            organizationId: membership.organizationId,
            actorId: membership.actorId,
            estimateId,
            newEstimateId,
          }),
          transactionId,
        });
      }
      await this.audit(
        transactionId,
        membership,
        mode === "revision" ? "estimate.revision_created" : "estimate.duplicated",
        "estimate",
        newEstimateId,
        requestId,
        { sourceEstimateId: estimateId, sourceRevision: required(source, "revision_number"), revisionNumber },
      );
      await this.completeCommand(transactionId, membership, commandName, idempotencyKey, newEstimateId);
      await this.database.commitTransaction(transactionId);
      return { data: {
        estimateId: newEstimateId,
        sourceEstimateId: mode === "revision" ? estimateId : null,
        status: "draft",
        revisionNumber,
        replayed: false,
      } };
    } catch (error) {
      await this.rollback(transactionId);
      throw error;
    }
  }

  duplicate(subject: string, estimateId: string, idempotencyKey: string, requestId: string) {
    return this.copy("duplicate", subject, estimateId, idempotencyKey, requestId);
  }

  createRevision(subject: string, estimateId: string, idempotencyKey: string, requestId: string) {
    return this.copy("revision", subject, estimateId, idempotencyKey, requestId);
  }

  private async failDocument(
    subject: string,
    estimateId: string,
    documentId: string,
    failureCode: string,
  ) {
    const transactionId = await this.database.beginTransaction();
    try {
      const membership = await this.establishContext(transactionId, subject);
      await this.database.execute({
        sql: FAIL_DOCUMENT_SQL,
        parameters: parameters({
          organizationId: membership.organizationId,
          actorId: membership.actorId,
          estimateId,
          documentId,
          failureCode,
        }),
        transactionId,
      });
      await this.database.commitTransaction(transactionId);
    } catch (error) {
      await this.rollback(transactionId);
      throw error;
    }
  }

  async generate(
    subject: string,
    estimateId: string,
    type: EstimateDocumentType,
    idempotencyKey: string,
    requestId: string,
  ): Promise<GenerateEstimateDocumentResponse> {
    const canonical = (await new EstimateService(this.database).get(subject, estimateId)).data;
    let renderedAt = this.clock();
    let generated = await this.generator(canonical, type, renderedAt);
    const transactionId = await this.database.beginTransaction();
    let membership: Membership;
    let reservation: SqlRow;
    let replayed = false;
    try {
      membership = await this.establishContext(transactionId, subject);
      const documentId = this.idFactory();
      const objectKey = buildEstimateDocumentKey({
        organizationId: membership.organizationId,
        estimateId,
        revision: canonical.revisionNumber,
        documentId,
        type,
      });
      const common = {
        organizationId: membership.organizationId,
        actorId: membership.actorId,
        estimateId,
        revision: canonical.revisionNumber,
        documentType: type,
        idempotencyKey,
      };
      const inserted = await this.database.execute({
        sql: INSERT_DOCUMENT_SQL,
        parameters: parameters({
          ...common,
          documentId,
          objectKey,
          filename: generated.filename,
          contentType: generated.contentType,
          byteSize: String(generated.bytes.byteLength),
          checksumSha256: generated.checksumSha256,
          sourceRowVersion: canonical.rowVersion,
          generatorVersion: ESTIMATE_DOCUMENT_GENERATOR_VERSION,
          renderedAt: renderedAt.toISOString(),
        }),
        transactionId,
      });
      if (inserted.length === 1) reservation = inserted[0];
      else {
        const existing = await this.database.execute({
          sql: SELECT_DOCUMENT_RESERVATION_SQL,
          parameters: parameters(common),
          transactionId,
        });
        if (existing.length !== 1) throw new EstimateServiceError("idempotency_conflict", "The document request could not be replayed.", 409);
        reservation = existing[0];
        replayed = true;
      }
      await this.database.commitTransaction(transactionId);
    } catch (error) {
      await this.rollback(transactionId);
      throw error;
    }

    if (required(reservation, "state") === "ready") {
      return { data: { ...documentRecord(reservation), replayed: true } };
    }
    if (required(reservation, "state") === "failed") {
      throw new EstimateServiceError("document_generation_failed", "That document attempt failed. Start a new generation request.", 409);
    }
    const documentId = required(reservation, "id");
    const objectKey = required(reservation, "object_key");
    const expectedChecksum = required(reservation, "checksum_sha256");
    renderedAt = new Date(required(reservation, "rendered_at"));
    if (replayed) generated = await this.generator(canonical, type, renderedAt);

    let stored = await this.storage.head(objectKey);
    if (stored && stored.checksumSha256 !== expectedChecksum) {
      await this.failDocument(subject, estimateId, documentId, "object_checksum_mismatch");
      throw new EstimateServiceError("document_storage_conflict", "The reserved document object did not match its checksum.", 409);
    }
    if (!stored) {
      if (required(reservation, "source_row_version") !== canonical.rowVersion || generated.checksumSha256 !== expectedChecksum) {
        await this.failDocument(subject, estimateId, documentId, "source_changed");
        throw new EstimateServiceError("document_source_changed", "The estimate changed before document generation completed. Start a new request.", 409);
      }
      try {
        stored = await this.storage.put({
          body: generated.bytes,
          checksumSha256: generated.checksumSha256,
          contentType: generated.contentType,
          documentId,
          estimateId,
          key: objectKey,
          revision: canonical.revisionNumber,
        });
      } catch {
        try { await this.failDocument(subject, estimateId, documentId, "object_upload_failed"); } catch { /* pending row is recoverable */ }
        throw new EstimateServiceError("document_storage_unavailable", "The document could not be stored. Try again with a new request.", 503);
      }
    }

    const finalizeTransactionId = await this.database.beginTransaction();
    try {
      const finalMembership = await this.establishContext(finalizeTransactionId, subject);
      const finalized = await this.database.execute({
        sql: FINALIZE_DOCUMENT_SQL,
        parameters: parameters({
          organizationId: finalMembership.organizationId,
          actorId: finalMembership.actorId,
          estimateId,
          documentId,
          byteSize: String(stored.byteSize),
          checksumSha256: stored.checksumSha256,
          objectVersionId: stored.versionId ?? "",
        }),
        transactionId: finalizeTransactionId,
      });
      if (finalized.length !== 1) {
        throw new EstimateServiceError("document_finalize_pending", "The document was stored but its history is still pending. Replay the same request.", 503);
      }
      await this.audit(finalizeTransactionId, finalMembership, "estimate.document_generated", "estimate_document", documentId, requestId, {
        estimateId,
        revisionNumber: canonical.revisionNumber,
        type,
        checksumSha256: stored.checksumSha256,
        byteSize: String(stored.byteSize),
      });
      await this.database.commitTransaction(finalizeTransactionId);
      return { data: { ...documentRecord(finalized[0]), replayed } };
    } catch (error) {
      await this.rollback(finalizeTransactionId);
      throw error;
    }
  }

  async listDocuments(subject: string, estimateId: string): Promise<ListEstimateDocumentsResponse> {
    const transactionId = await this.database.beginTransaction();
    try {
      const membership = await this.establishContext(transactionId, subject);
      const estimate = await this.database.execute({
        sql: LOCK_ESTIMATE_SQL.replace("for update", ""),
        parameters: parameters({ organizationId: membership.organizationId, estimateId }),
        transactionId,
      });
      if (estimate.length !== 1) throw new EstimateServiceError("estimate_not_found", "The estimate was not found.", 404);
      const rows = await this.database.execute({
        sql: LIST_DOCUMENTS_SQL,
        parameters: parameters({ organizationId: membership.organizationId, estimateId }),
        transactionId,
      });
      await this.database.commitTransaction(transactionId);
      return { data: rows.map(documentRecord) };
    } catch (error) {
      await this.rollback(transactionId);
      throw error;
    }
  }

  async download(
    subject: string,
    estimateId: string,
    documentId: string,
  ): Promise<EstimateDocumentDownloadResponse> {
    const transactionId = await this.database.beginTransaction();
    let row: SqlRow;
    try {
      const membership = await this.establishContext(transactionId, subject);
      const rows = await this.database.execute({
        sql: DOWNLOAD_DOCUMENT_SQL,
        parameters: parameters({ organizationId: membership.organizationId, estimateId, documentId }),
        transactionId,
      });
      if (rows.length !== 1) throw new EstimateServiceError("document_not_found", "The generated document was not found.", 404);
      row = rows[0];
      await this.database.commitTransaction(transactionId);
    } catch (error) {
      await this.rollback(transactionId);
      throw error;
    }
    const downloadUrl = await this.storage.presignDownload({
      contentType: required(row, "content_type"),
      filename: required(row, "original_filename"),
      key: required(row, "object_key"),
    });
    return { data: {
      documentId: required(row, "id"),
      filename: required(row, "original_filename"),
      downloadUrl,
      expiresAt: new Date(this.clock().getTime() + (ESTIMATE_DOWNLOAD_TTL_SECONDS * 1000)).toISOString(),
    } };
  }
}
