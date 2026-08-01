import { createHash, randomUUID } from "node:crypto";
import {
  calculateEstimateTotals,
  parseDecimal,
} from "../../lib/estimates/calculations";
import type {
  CreateEstimateDraftRequest,
  EstimateListItem,
  EstimateStatus,
  ListEstimatesResponse,
} from "../../lib/aws/api/estimate-contracts";
import type { EstimateDatabase, SqlRow } from "./database";
import { parameters } from "./database";
import { EstimateServiceError, invalidRequest } from "./errors";

export type OrganizationRole = "owner" | "admin" | "staff";

type MembershipContext = Readonly<{
  actorId: string;
  organizationId: string;
  role: OrganizationRole;
}>;

export const ESTABLISH_CONTEXT_SQL = `
select actor_id, organization_id::text, role
from app_private.establish_estimate_context(:subject)
`;

export const LIST_ESTIMATES_SQL = `
select id::text, document_type, estimate_number, project_name, prepared_for,
       status, total_minor::text, updated_at::text
from app.estimates
where organization_id = :organizationId::uuid
  and deleted_at is null
  and (
    :cursorUpdatedAt = ''
    or (updated_at, id) < (:cursorUpdatedAt::timestamptz, :cursorId::uuid)
  )
order by updated_at desc, id desc
limit :fetchLimit::integer
`;

const INSERT_IDEMPOTENCY_SQL = `
insert into app.estimate_command_idempotency (
  organization_id, command_name, idempotency_key, request_hash,
  created_by, updated_by
) values (
  :organizationId::uuid, 'create_estimate_draft', :idempotencyKey, :requestHash,
  :actorId, :actorId
)
on conflict (organization_id, command_name, idempotency_key) do nothing
returning request_hash, estimate_id::text
`;

const SELECT_IDEMPOTENCY_SQL = `
select request_hash, estimate_id::text
from app.estimate_command_idempotency
where organization_id = :organizationId::uuid
  and command_name = 'create_estimate_draft'
  and idempotency_key = :idempotencyKey
`;

const INSERT_CUSTOMER_SQL = `
insert into app.customers (
  id, organization_id, name, contact_information, created_by, updated_by
) values (
  :customerId::uuid, :organizationId::uuid, :customerName,
  :contactInformation, :actorId, :actorId
)
`;

const INSERT_PROJECT_SQL = `
insert into app.projects (
  id, organization_id, customer_id, name, location, created_by, updated_by
) values (
  :projectId::uuid, :organizationId::uuid, :customerId::uuid,
  :projectName, :projectLocation, :actorId, :actorId
)
`;

const INSERT_ESTIMATE_SQL = `
insert into app.estimates (
  id, organization_id, project_id, status, document_type, estimate_number,
  project_name, project_location, prepared_for, contact_information,
  deposit_percent, tax_rate_percent, subtotal_minor, sales_tax_minor,
  total_minor, required_deposit_minor, remaining_balance_minor,
  created_by, updated_by
) values (
  :estimateId::uuid, :organizationId::uuid, :projectId::uuid, 'draft',
  :documentType, :estimateNumber, :projectName, :projectLocation, :preparedFor,
  :contactInformation, :depositPercent::numeric, 0, :subtotalMinor::bigint, 0,
  :totalMinor::bigint, :requiredDepositMinor::bigint,
  :remainingBalanceMinor::bigint, :actorId, :actorId
)
`;

const INSERT_PRICING_SQL = `
insert into app.estimate_pricing_lines (
  id, organization_id, estimate_id, kind, sort_order, description,
  amount_minor, created_by, updated_by
) values (
  :pricingLineId::uuid, :organizationId::uuid, :estimateId::uuid,
  'base', 0, :pricingDescription, :pricingAmountMinor::bigint,
  :actorId, :actorId
)
`;

const INSERT_AUDIT_SQL = `
insert into app.audit_events (
  id, organization_id, actor_id, action, entity_type, entity_id,
  request_id, metadata, created_by, updated_by
) values (
  :auditEventId::uuid, :organizationId::uuid, :actorId,
  'estimate.draft_created', 'estimate', :estimateId::uuid,
  :requestId, :metadata::jsonb, :actorId, :actorId
)
`;

const COMPLETE_IDEMPOTENCY_SQL = `
update app.estimate_command_idempotency
set estimate_id = :estimateId::uuid
where organization_id = :organizationId::uuid
  and command_name = 'create_estimate_draft'
  and idempotency_key = :idempotencyKey
`;

function required(row: SqlRow, field: string): string {
  const value = row[field];
  if (!value) {
    throw new EstimateServiceError(
      "database_contract_error",
      "The estimate data contract is invalid.",
      500,
    );
  }
  return value;
}

function requestHash(request: CreateEstimateDraftRequest): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        request.customerName,
        request.projectName,
        request.projectLocation,
        request.preparedFor,
        request.contactInformation,
        request.documentType,
        request.estimateNumber,
        request.pricingDescription,
        request.pricingAmountMinor,
        request.depositPercent,
      ]),
    )
    .digest("hex");
}

type Cursor = Readonly<{ updatedAt: string; id: string }>;

function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<Cursor>;
    if (
      typeof parsed.updatedAt !== "string" ||
      Number.isNaN(Date.parse(parsed.updatedAt)) ||
      typeof parsed.id !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        parsed.id,
      )
    ) {
      throw new Error("invalid");
    }
    return { updatedAt: parsed.updatedAt, id: parsed.id };
  } catch {
    throw invalidRequest("The pagination cursor is invalid.");
  }
}

function encodeCursor(item: EstimateListItem): string {
  return Buffer.from(
    JSON.stringify({ updatedAt: item.updatedAt, id: item.id }),
  ).toString("base64url");
}

export class EstimateService {
  constructor(
    private readonly database: EstimateDatabase,
    private readonly idFactory: () => string = randomUUID,
  ) {}

  private async establishContext(
    transactionId: string,
    subject: string,
  ): Promise<MembershipContext> {
    const rows = await this.database.execute({
      sql: ESTABLISH_CONTEXT_SQL,
      parameters: parameters({ subject }),
      transactionId,
    });
    if (rows.length !== 1) {
      throw new EstimateServiceError(
        "active_membership_required",
        "An active organization membership is required.",
        403,
      );
    }
    const role = required(rows[0], "role");
    if (!["owner", "admin", "staff"].includes(role)) {
      throw new EstimateServiceError(
        "active_membership_required",
        "An active organization membership is required.",
        403,
      );
    }
    return {
      actorId: required(rows[0], "actor_id"),
      organizationId: required(rows[0], "organization_id"),
      role: role as OrganizationRole,
    };
  }

  private async rollback(transactionId: string): Promise<void> {
    try {
      await this.database.rollbackTransaction(transactionId);
    } catch {
      // Preserve the original operation error; the adapter must log rollback failure.
    }
  }

  async list(
    subject: string,
    options: Readonly<{ cursor?: string; limit?: number }> = {},
  ): Promise<ListEstimatesResponse> {
    const limit = options.limit ?? 25;
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw invalidRequest("Limit must be an integer between 1 and 100.");
    }
    const cursor = decodeCursor(options.cursor);
    const transactionId = await this.database.beginTransaction();
    try {
      const membership = await this.establishContext(transactionId, subject);
      const rows = await this.database.execute({
        sql: LIST_ESTIMATES_SQL,
        parameters: parameters({
          organizationId: membership.organizationId,
          cursorUpdatedAt: cursor?.updatedAt ?? "",
          cursorId: cursor?.id ?? "00000000-0000-0000-0000-000000000000",
          fetchLimit: String(limit + 1),
        }),
        transactionId,
      });
      const items = rows.slice(0, limit).map((row) => ({
        id: required(row, "id"),
        documentType: required(row, "document_type") as EstimateListItem["documentType"],
        estimateNumber: row.estimate_number ?? "",
        projectName: required(row, "project_name"),
        preparedFor: required(row, "prepared_for"),
        status: required(row, "status") as EstimateStatus,
        totalMinor: required(row, "total_minor"),
        updatedAt: required(row, "updated_at"),
      }));
      await this.database.commitTransaction(transactionId);
      return {
        data: items,
        page: {
          nextCursor:
            rows.length > limit ? encodeCursor(items[items.length - 1]) : null,
        },
      };
    } catch (error) {
      await this.rollback(transactionId);
      throw error;
    }
  }

  async createDraft(
    subject: string,
    request: CreateEstimateDraftRequest,
    idempotencyKey: string,
    requestId: string,
  ): Promise<Readonly<{ estimateId: string; status: "draft"; replayed: boolean }>> {
    const totals = calculateEstimateTotals(
      [BigInt(request.pricingAmountMinor)],
      parseDecimal(request.depositPercent, "Deposit %"),
    );
    const hash = requestHash(request);
    const transactionId = await this.database.beginTransaction();
    try {
      const membership = await this.establishContext(transactionId, subject);
      const common = {
        organizationId: membership.organizationId,
        actorId: membership.actorId,
      };
      const inserted = await this.database.execute({
        sql: INSERT_IDEMPOTENCY_SQL,
        parameters: parameters({ ...common, idempotencyKey, requestHash: hash }),
        transactionId,
      });
      if (inserted.length === 0) {
        const existing = await this.database.execute({
          sql: SELECT_IDEMPOTENCY_SQL,
          parameters: parameters({
            organizationId: membership.organizationId,
            idempotencyKey,
          }),
          transactionId,
        });
        if (
          existing.length !== 1 ||
          required(existing[0], "request_hash") !== hash
        ) {
          throw new EstimateServiceError(
            "idempotency_conflict",
            "That idempotency key was already used for another request.",
            409,
          );
        }
        const estimateId = required(existing[0], "estimate_id");
        await this.database.commitTransaction(transactionId);
        return { estimateId, status: "draft", replayed: true };
      }

      const customerId = this.idFactory();
      const projectId = this.idFactory();
      const estimateId = this.idFactory();
      const pricingLineId = this.idFactory();
      const auditEventId = this.idFactory();
      await this.database.execute({
        sql: INSERT_CUSTOMER_SQL,
        parameters: parameters({
          ...common,
          customerId,
          customerName: request.customerName,
          contactInformation: request.contactInformation,
        }),
        transactionId,
      });
      await this.database.execute({
        sql: INSERT_PROJECT_SQL,
        parameters: parameters({
          ...common,
          projectId,
          customerId,
          projectName: request.projectName,
          projectLocation: request.projectLocation,
        }),
        transactionId,
      });
      await this.database.execute({
        sql: INSERT_ESTIMATE_SQL,
        parameters: parameters({
          ...common,
          projectId,
          estimateId,
          documentType: request.documentType,
          estimateNumber: request.estimateNumber,
          projectName: request.projectName,
          projectLocation: request.projectLocation,
          preparedFor: request.preparedFor,
          contactInformation: request.contactInformation,
          depositPercent: request.depositPercent,
          subtotalMinor: totals.subtotalMinor.toString(),
          totalMinor: totals.totalMinor.toString(),
          requiredDepositMinor: totals.requiredDepositMinor.toString(),
          remainingBalanceMinor: totals.remainingBalanceMinor.toString(),
        }),
        transactionId,
      });
      await this.database.execute({
        sql: INSERT_PRICING_SQL,
        parameters: parameters({
          ...common,
          pricingLineId,
          estimateId,
          pricingDescription: request.pricingDescription,
          pricingAmountMinor: request.pricingAmountMinor,
        }),
        transactionId,
      });
      await this.database.execute({
        sql: INSERT_AUDIT_SQL,
        parameters: parameters({
          ...common,
          auditEventId,
          estimateId,
          requestId,
          metadata: JSON.stringify({
            documentType: request.documentType,
            revisionNumber: "1",
          }),
        }),
        transactionId,
      });
      await this.database.execute({
        sql: COMPLETE_IDEMPOTENCY_SQL,
        parameters: parameters({
          organizationId: membership.organizationId,
          estimateId,
          idempotencyKey,
        }),
        transactionId,
      });
      await this.database.commitTransaction(transactionId);
      return { estimateId, status: "draft", replayed: false };
    } catch (error) {
      await this.rollback(transactionId);
      throw error;
    }
  }
}
