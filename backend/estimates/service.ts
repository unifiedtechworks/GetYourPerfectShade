import { createHash, randomUUID } from "node:crypto";
import {
  calculateEstimateTotals,
  parseDecimal,
} from "../../lib/estimates/calculations";
import type {
  CreateEstimateDraftRequest,
  EstimateDetail,
  EstimateListItem,
  EstimatePricingLine,
  EstimateScopeItem,
  EstimateStatus,
  GetEstimateResponse,
  ListEstimatesResponse,
  UpdateEstimateDraftRequest,
  UpdateEstimateDraftResponse,
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

export const GET_ESTIMATE_SQL = `
select e.id::text, e.document_type, e.estimate_number, e.estimate_date,
       e.valid_through, e.bid_due, e.project_name, e.project_location,
       e.prepared_for, e.contact_information, e.status,
       e.revision_number::text, e.row_version::text,
       e.deposit_percent::text, e.tax_rate_percent::text,
       e.include_alternate_pricing::text,
       e.subtotal_minor::text, e.sales_tax_minor::text, e.total_minor::text,
       e.required_deposit_minor::text, e.remaining_balance_minor::text,
       e.created_by, e.updated_by, e.created_at::text, e.updated_at::text,
       p.id::text as project_id, c.id::text as customer_id, c.name as customer_name
from app.estimates e
join app.projects p
  on p.organization_id = e.organization_id and p.id = e.project_id
join app.customers c
  on c.organization_id = p.organization_id and c.id = p.customer_id
where e.organization_id = :organizationId::uuid
  and e.id = :estimateId::uuid
  and e.deleted_at is null
  and p.deleted_at is null
  and c.deleted_at is null
`;

const GET_SCOPE_SQL = `
select sort_order::text, description
from app.estimate_scope_items
where organization_id = :organizationId::uuid
  and estimate_id = :estimateId::uuid
order by sort_order
`;

const GET_PRICING_SQL = `
select kind, sort_order::text, description, amount_minor::text
from app.estimate_pricing_lines
where organization_id = :organizationId::uuid
  and estimate_id = :estimateId::uuid
order by kind, sort_order
`;

const LOCK_ESTIMATE_SQL = `
select id::text, project_id::text, status, row_version::text
from app.estimates
where organization_id = :organizationId::uuid
  and id = :estimateId::uuid
  and deleted_at is null
for update
`;

const UPDATE_PROJECT_SQL = `
update app.projects
set name = :projectName, location = :projectLocation, updated_by = :actorId
where organization_id = :organizationId::uuid
  and id = :projectId::uuid
  and deleted_at is null
`;

const UPDATE_ESTIMATE_SQL = `
update app.estimates
set document_type = :documentType,
    estimate_number = :estimateNumber,
    estimate_date = :estimateDate,
    valid_through = :validThrough,
    bid_due = :bidDue,
    project_name = :projectName,
    project_location = :projectLocation,
    prepared_for = :preparedFor,
    contact_information = :contactInformation,
    deposit_percent = :depositPercent::numeric,
    tax_rate_percent = 0,
    include_alternate_pricing = :includeAlternatePricing::boolean,
    subtotal_minor = :subtotalMinor::bigint,
    sales_tax_minor = 0,
    total_minor = :totalMinor::bigint,
    required_deposit_minor = :requiredDepositMinor::bigint,
    remaining_balance_minor = :remainingBalanceMinor::bigint,
    updated_by = :actorId
where organization_id = :organizationId::uuid
  and id = :estimateId::uuid
  and status = 'draft'
  and row_version = :expectedRowVersion::bigint
  and deleted_at is null
returning row_version::text
`;

const REPLACE_PHASE_2_ROWS_SQL = `
select app_private.replace_estimate_phase_2_rows(
  :estimateId::uuid,
  :scopeItems::jsonb,
  :pricingLines::jsonb,
  :alternatePricingLines::jsonb
)
`;

const INSERT_UPDATE_AUDIT_SQL = `
insert into app.audit_events (
  id, organization_id, actor_id, action, entity_type, entity_id,
  request_id, metadata, created_by, updated_by
) values (
  :auditEventId::uuid, :organizationId::uuid, :actorId,
  'estimate.draft_updated', 'estimate', :estimateId::uuid,
  :requestId, :metadata::jsonb, :actorId, :actorId
)
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

function booleanValue(row: SqlRow, field: string): boolean {
  const value = required(row, field);
  if (value === "true") return true;
  if (value === "false") return false;
  throw new EstimateServiceError(
    "database_contract_error",
    "The estimate data contract is invalid.",
    500,
  );
}

function sortOrder(row: SqlRow): number {
  const value = Number(required(row, "sort_order"));
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new EstimateServiceError(
      "database_contract_error",
      "The estimate data contract is invalid.",
      500,
    );
  }
  return value;
}

function ensureBigint(value: bigint, field: string): void {
  if (value < -(2n ** 63n) || value > 2n ** 63n - 1n) {
    throw invalidRequest(`${field} is outside the supported range.`);
  }
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

  private async loadDetail(
    transactionId: string,
    membership: MembershipContext,
    estimateId: string,
  ): Promise<EstimateDetail | null> {
    const commonParameters = parameters({
      organizationId: membership.organizationId,
      estimateId,
    });
    const headerRows = await this.database.execute({
      sql: GET_ESTIMATE_SQL,
      parameters: commonParameters,
      transactionId,
    });
    if (headerRows.length === 0) return null;
    if (headerRows.length !== 1) {
      throw new EstimateServiceError(
        "database_contract_error",
        "The estimate data contract is invalid.",
        500,
      );
    }
    const scopeRows = await this.database.execute({
      sql: GET_SCOPE_SQL,
      parameters: commonParameters,
      transactionId,
    });
    const pricingRows = await this.database.execute({
      sql: GET_PRICING_SQL,
      parameters: commonParameters,
      transactionId,
    });
    const header = headerRows[0];
    const scopeItems: EstimateScopeItem[] = scopeRows.map((row) => ({
      sortOrder: sortOrder(row),
      description: required(row, "description"),
    }));
    const basePricing: EstimatePricingLine[] = [];
    const alternatePricing: EstimatePricingLine[] = [];
    for (const row of pricingRows) {
      const line = {
        sortOrder: sortOrder(row),
        description: row.description ?? "",
        amountMinor: required(row, "amount_minor"),
      };
      const kind = required(row, "kind");
      if (kind === "base") basePricing.push(line);
      else if (kind === "alternate") alternatePricing.push(line);
      else {
        throw new EstimateServiceError(
          "database_contract_error",
          "The estimate data contract is invalid.",
          500,
        );
      }
    }
    const alternateTotalMinor = alternatePricing.reduce(
      (sum, line) => sum + BigInt(line.amountMinor),
      0n,
    );

    return {
      id: required(header, "id"),
      customerId: required(header, "customer_id"),
      customerName: required(header, "customer_name"),
      projectId: required(header, "project_id"),
      documentType: required(header, "document_type") as EstimateDetail["documentType"],
      estimateNumber: header.estimate_number ?? "",
      estimateDate: header.estimate_date ?? "",
      validThrough: header.valid_through ?? "",
      bidDue: header.bid_due ?? "",
      projectName: required(header, "project_name"),
      projectLocation: header.project_location ?? "",
      preparedFor: required(header, "prepared_for"),
      contactInformation: header.contact_information ?? "",
      status: required(header, "status") as EstimateStatus,
      revisionNumber: required(header, "revision_number"),
      rowVersion: required(header, "row_version"),
      depositPercent: required(header, "deposit_percent"),
      taxRatePercent: required(header, "tax_rate_percent") as "0",
      includeAlternatePricing: booleanValue(
        header,
        "include_alternate_pricing",
      ),
      scopeItems,
      pricingLines: basePricing,
      alternatePricingLines: alternatePricing,
      totals: {
        subtotalMinor: required(header, "subtotal_minor"),
        salesTaxMinor: required(header, "sales_tax_minor"),
        totalMinor: required(header, "total_minor"),
        requiredDepositMinor: required(header, "required_deposit_minor"),
        remainingBalanceMinor: required(header, "remaining_balance_minor"),
        alternateTotalMinor: alternateTotalMinor.toString(),
      },
      createdBy: required(header, "created_by"),
      updatedBy: required(header, "updated_by"),
      createdAt: required(header, "created_at"),
      updatedAt: required(header, "updated_at"),
    };
  }

  async get(subject: string, estimateId: string): Promise<GetEstimateResponse> {
    const transactionId = await this.database.beginTransaction();
    try {
      const membership = await this.establishContext(transactionId, subject);
      const estimate = await this.loadDetail(
        transactionId,
        membership,
        estimateId,
      );
      if (!estimate) {
        throw new EstimateServiceError(
          "estimate_not_found",
          "The estimate was not found.",
          404,
        );
      }
      await this.database.commitTransaction(transactionId);
      return { data: estimate };
    } catch (error) {
      await this.rollback(transactionId);
      throw error;
    }
  }

  async updateDraft(
    subject: string,
    estimateId: string,
    request: UpdateEstimateDraftRequest,
    requestId: string,
  ): Promise<UpdateEstimateDraftResponse> {
    const totals = calculateEstimateTotals(
      request.pricingLines.map((line) => BigInt(line.amountMinor)),
      parseDecimal(request.depositPercent, "Deposit %"),
    );
    const alternateTotal = request.alternatePricingLines.reduce(
      (sum, line) => sum + BigInt(line.amountMinor),
      0n,
    );
    for (const [label, value] of [
      ["Subtotal", totals.subtotalMinor],
      ["Total", totals.totalMinor],
      ["Required deposit", totals.requiredDepositMinor],
      ["Remaining balance", totals.remainingBalanceMinor],
      ["Alternate total", alternateTotal],
    ] as const) {
      ensureBigint(value, label);
    }

    const transactionId = await this.database.beginTransaction();
    try {
      const membership = await this.establishContext(transactionId, subject);
      const common = {
        organizationId: membership.organizationId,
        actorId: membership.actorId,
        estimateId,
      };
      const locked = await this.database.execute({
        sql: LOCK_ESTIMATE_SQL,
        parameters: parameters(common),
        transactionId,
      });
      if (locked.length === 0) {
        throw new EstimateServiceError(
          "estimate_not_found",
          "The estimate was not found.",
          404,
        );
      }
      if (locked.length !== 1) {
        throw new EstimateServiceError(
          "database_contract_error",
          "The estimate data contract is invalid.",
          500,
        );
      }
      const current = locked[0];
      if (required(current, "status") !== "draft") {
        throw new EstimateServiceError(
          "estimate_not_editable",
          "Only draft estimates can be edited. Create a new revision for an issued estimate.",
          409,
        );
      }
      if (required(current, "row_version") !== request.expectedRowVersion) {
        throw new EstimateServiceError(
          "stale_estimate",
          "This draft changed after it was loaded. Reload it before saving.",
          409,
        );
      }
      const projectId = required(current, "project_id");
      await this.database.execute({
        sql: UPDATE_PROJECT_SQL,
        parameters: parameters({
          ...common,
          projectId,
          projectName: request.projectName,
          projectLocation: request.projectLocation,
        }),
        transactionId,
      });
      const updatedRows = await this.database.execute({
        sql: UPDATE_ESTIMATE_SQL,
        parameters: parameters({
          ...common,
          expectedRowVersion: request.expectedRowVersion,
          documentType: request.documentType,
          estimateNumber: request.estimateNumber,
          estimateDate: request.estimateDate,
          validThrough: request.validThrough,
          bidDue: request.bidDue,
          projectName: request.projectName,
          projectLocation: request.projectLocation,
          preparedFor: request.preparedFor,
          contactInformation: request.contactInformation,
          depositPercent: request.depositPercent,
          includeAlternatePricing: String(request.includeAlternatePricing),
          subtotalMinor: totals.subtotalMinor.toString(),
          totalMinor: totals.totalMinor.toString(),
          requiredDepositMinor: totals.requiredDepositMinor.toString(),
          remainingBalanceMinor: totals.remainingBalanceMinor.toString(),
        }),
        transactionId,
      });
      if (updatedRows.length !== 1) {
        throw new EstimateServiceError(
          "stale_estimate",
          "This draft changed after it was loaded. Reload it before saving.",
          409,
        );
      }
      const nextRowVersion = required(updatedRows[0], "row_version");
      await this.database.execute({
        sql: REPLACE_PHASE_2_ROWS_SQL,
        parameters: parameters({
          estimateId,
          scopeItems: JSON.stringify(request.scopeItems),
          pricingLines: JSON.stringify(request.pricingLines),
          alternatePricingLines: JSON.stringify(request.alternatePricingLines),
        }),
        transactionId,
      });
      await this.database.execute({
        sql: INSERT_UPDATE_AUDIT_SQL,
        parameters: parameters({
          ...common,
          auditEventId: this.idFactory(),
          requestId,
          metadata: JSON.stringify({
            previousRowVersion: request.expectedRowVersion,
            rowVersion: nextRowVersion,
            scopeItemCount: request.scopeItems.length,
            pricingLineCount: request.pricingLines.length,
            alternatePricingLineCount: request.alternatePricingLines.length,
            includeAlternatePricing: request.includeAlternatePricing,
          }),
        }),
        transactionId,
      });
      const estimate = await this.loadDetail(
        transactionId,
        membership,
        estimateId,
      );
      if (!estimate) {
        throw new EstimateServiceError(
          "database_contract_error",
          "The estimate data contract is invalid.",
          500,
        );
      }
      await this.database.commitTransaction(transactionId);
      return { data: estimate };
    } catch (error) {
      await this.rollback(transactionId);
      throw error;
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
