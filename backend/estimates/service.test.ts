import { describe, expect, it } from "vitest";
import type {
  CreateEstimateDraftRequest,
  UpdateEstimateDraftRequest,
} from "../../lib/aws/api/estimate-contracts";
import type {
  EstimateDatabase,
  SqlRow,
  SqlStatement,
} from "./database";
import { EstimateService } from "./service";

const REQUEST: CreateEstimateDraftRequest = {
  customerName: "Acme",
  projectName: "Atrium",
  projectLocation: "Portland",
  preparedFor: "Morgan Architect",
  contactInformation: "Owner",
  documentType: "Bid Proposal",
  estimateNumber: "B-100",
  pricingDescription: "Window coverings",
  pricingAmountMinor: "100",
  depositPercent: "0.5",
};

const UPDATE_REQUEST: UpdateEstimateDraftRequest = {
  expectedRowVersion: "2",
  documentType: "Bid Proposal",
  estimateNumber: "B-101",
  estimateDate: "August 5, 2026",
  validThrough: "30 days",
  bidDue: "",
  projectName: "Atrium Updated",
  projectLocation: "Portland",
  preparedFor: "Morgan Architect",
  contactInformation: "Owner",
  depositPercent: "0.5",
  includeAlternatePricing: true,
  scopeItems: [{ description: "First" }, { description: "Second" }],
  pricingLines: [
    { description: "Base", amountMinor: "100" },
    { description: "Credit", amountMinor: "-25" },
  ],
  alternatePricingLines: [{ description: "Option", amountMinor: "500" }],
};

const DETAIL_ROW: SqlRow = {
  id: "22222222-2222-2222-2222-222222222222",
  customer_id: "33333333-3333-3333-3333-333333333333",
  customer_name: "Acme",
  project_id: "44444444-4444-4444-4444-444444444444",
  document_type: "Bid Proposal",
  estimate_number: "B-101",
  estimate_date: "August 5, 2026",
  valid_through: "30 days",
  bid_due: "",
  project_name: "Atrium Updated",
  project_location: "Portland",
  prepared_for: "Morgan Architect",
  contact_information: "Owner",
  status: "draft",
  revision_number: "1",
  row_version: "3",
  deposit_percent: "0.5",
  tax_rate_percent: "0",
  include_alternate_pricing: "true",
  subtotal_minor: "75",
  sales_tax_minor: "0",
  total_minor: "75",
  required_deposit_minor: "0",
  remaining_balance_minor: "75",
  created_by: "cognito-subject",
  updated_by: "cognito-subject",
  created_at: "2026-08-01T00:00:00Z",
  updated_at: "2026-08-05T00:00:00Z",
};

class FakeDatabase implements EstimateDatabase {
  readonly statements: SqlStatement[] = [];
  committed = false;
  rolledBack = false;
  failOn = "";
  membership: readonly SqlRow[] = [
    {
      actor_id: "cognito-subject",
      organization_id: "11111111-1111-1111-1111-111111111111",
      role: "staff",
    },
  ];
  idempotencyRows: readonly SqlRow[] = [
    { request_hash: "inserted", estimate_id: null },
  ];
  existingIdempotencyRows: readonly SqlRow[] = [];
  listRows: readonly SqlRow[] = [];
  detailRows: readonly SqlRow[] = [];
  scopeRows: readonly SqlRow[] = [];
  pricingRows: readonly SqlRow[] = [];
  lockedEstimateRows: readonly SqlRow[] = [];
  updatedEstimateRows: readonly SqlRow[] = [];

  async beginTransaction() {
    return "tx-1";
  }

  async execute(statement: SqlStatement) {
    this.statements.push(statement);
    if (this.failOn && statement.sql.includes(this.failOn)) {
      throw new Error("forced database failure");
    }
    if (statement.sql.includes("establish_estimate_context")) {
      return this.membership;
    }
    if (statement.sql.includes("on conflict") && statement.sql.includes("idempotency")) {
      return this.idempotencyRows;
    }
    if (
      statement.sql.includes("select request_hash") &&
      statement.sql.includes("idempotency")
    ) {
      return this.existingIdempotencyRows;
    }
    if (statement.sql.includes("for update")) return this.lockedEstimateRows;
    if (statement.sql.includes("update app.estimates")) {
      return this.updatedEstimateRows;
    }
    if (statement.sql.includes("from app.estimate_scope_items")) {
      return this.scopeRows;
    }
    if (statement.sql.includes("from app.estimate_pricing_lines")) {
      return this.pricingRows;
    }
    if (statement.sql.includes("join app.projects")) return this.detailRows;
    if (statement.sql.includes("from app.estimates")) return this.listRows;
    return [];
  }

  async commitTransaction() {
    this.committed = true;
  }

  async rollbackTransaction() {
    this.rolledBack = true;
  }
}

function parameter(statement: SqlStatement, name: string): string | undefined {
  return statement.parameters?.find((item) => item.name === name)?.value;
}

describe("EstimateService tenant-scoped list", () => {
  it("uses the resolved membership organization in an explicit predicate", async () => {
    const database = new FakeDatabase();
    database.listRows = [
      {
        id: "22222222-2222-2222-2222-222222222222",
        document_type: "Bid Proposal",
        estimate_number: "",
        project_name: "Atrium",
        prepared_for: "Morgan",
        status: "draft",
        total_minor: "9223372036854775807",
        updated_at: "2026-08-01T00:00:00Z",
      },
    ];
    const result = await new EstimateService(database).list("cognito-subject");
    const listStatement = database.statements.find((statement) =>
      statement.sql.includes("from app.estimates"),
    );

    expect(listStatement?.sql).toContain(
      "where organization_id = :organizationId::uuid",
    );
    expect(parameter(listStatement!, "organizationId")).toBe(
      "11111111-1111-1111-1111-111111111111",
    );
    expect(result.data[0].totalMinor).toBe("9223372036854775807");
    expect(database.committed).toBe(true);
  });

  it("fails closed and rolls back for a missing or disabled membership", async () => {
    const database = new FakeDatabase();
    database.membership = [];
    await expect(
      new EstimateService(database).list("disabled-subject"),
    ).rejects.toMatchObject({ code: "active_membership_required", status: 403 });
    expect(database.rolledBack).toBe(true);
    expect(
      database.statements.some((statement) =>
        statement.sql.includes("from app.estimates"),
      ),
    ).toBe(false);
  });
});

describe("EstimateService editable detail", () => {
  it("loads one organization-scoped estimate with ordered child rows", async () => {
    const database = new FakeDatabase();
    database.detailRows = [DETAIL_ROW];
    database.scopeRows = [
      { sort_order: "0", description: "First" },
      { sort_order: "1", description: "Second" },
    ];
    database.pricingRows = [
      { kind: "base", sort_order: "0", description: "Base", amount_minor: "75" },
      {
        kind: "alternate",
        sort_order: "0",
        description: "Option",
        amount_minor: "500",
      },
    ];

    const result = await new EstimateService(database).get(
      "cognito-subject",
      "22222222-2222-2222-2222-222222222222",
    );
    expect(result.data.scopeItems.map((item) => item.description)).toEqual([
      "First",
      "Second",
    ]);
    expect(result.data.totals.alternateTotalMinor).toBe("500");
    expect(
      database.statements
        .filter((statement) => !statement.sql.includes("establish_estimate_context"))
        .every((statement) =>
          statement.parameters?.some(
            (item) =>
              item.name === "organizationId" &&
              item.value === "11111111-1111-1111-1111-111111111111",
          ),
        ),
    ).toBe(true);
    expect(database.committed).toBe(true);
  });

  it("returns the same not-found result for missing or cross-organization IDs", async () => {
    const database = new FakeDatabase();
    await expect(
      new EstimateService(database).get(
        "cognito-subject",
        "99999999-9999-4999-8999-999999999999",
      ),
    ).rejects.toMatchObject({ code: "estimate_not_found", status: 404 });
    expect(database.rolledBack).toBe(true);
    expect(
      database.statements.some((statement) =>
        statement.sql.includes("from app.estimate_scope_items"),
      ),
    ).toBe(false);
  });
});

describe("EstimateService atomic draft creation", () => {
  it("creates all five business records and commits for staff", async () => {
    const database = new FakeDatabase();
    let id = 0;
    const service = new EstimateService(
      database,
      () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`,
    );
    const result = await service.createDraft(
      "cognito-subject",
      REQUEST,
      "request-key-123456",
      "request-id",
    );
    const sql = database.statements.map((statement) => statement.sql).join("\n");

    expect(sql).toContain("insert into app.customers");
    expect(sql).toContain("insert into app.projects");
    expect(sql).toContain("insert into app.estimates");
    expect(sql).toContain("insert into app.estimate_pricing_lines");
    expect(sql).toContain("insert into app.audit_events");
    expect(sql).toContain("estimate.draft_created");
    const tenantStatements = database.statements.filter((statement) =>
      statement.parameters?.some((item) => item.name === "organizationId"),
    );
    expect(tenantStatements).not.toHaveLength(0);
    expect(
      tenantStatements.every(
        (statement) =>
          parameter(statement, "organizationId") ===
          "11111111-1111-1111-1111-111111111111",
      ),
    ).toBe(true);
    expect(database.committed).toBe(true);
    expect(database.rolledBack).toBe(false);
    expect(result).toEqual({
      estimateId: "00000000-0000-4000-8000-000000000003",
      status: "draft",
      replayed: false,
    });
    const estimateInsert = database.statements.find((statement) =>
      statement.sql.includes("insert into app.estimates"),
    )!;
    expect(parameter(estimateInsert, "requiredDepositMinor")).toBe("1");
    expect(parameter(estimateInsert, "remainingBalanceMinor")).toBe("99");
  });

  it("rolls back without an audit event when any insert fails", async () => {
    const database = new FakeDatabase();
    database.failOn = "insert into app.estimates";
    await expect(
      new EstimateService(database).createDraft(
        "cognito-subject",
        REQUEST,
        "request-key-123456",
        "request-id",
      ),
    ).rejects.toThrow("forced database failure");
    expect(database.rolledBack).toBe(true);
    expect(database.committed).toBe(false);
    expect(
      database.statements.some((statement) =>
        statement.sql.includes("insert into app.audit_events"),
      ),
    ).toBe(false);
  });

  it("returns the original draft for an idempotent replay", async () => {
    const database = new FakeDatabase();
    database.idempotencyRows = [];
    const first = new EstimateService(database);
    // Derive the request hash using a first attempt that stops after inserting the key.
    database.failOn = "insert into app.customers";
    await expect(
      first.createDraft(
        "cognito-subject",
        REQUEST,
        "request-key-123456",
        "request-id",
      ),
    ).rejects.toThrow();
    const keyInsert = database.statements.find((statement) =>
      statement.sql.includes("on conflict"),
    )!;
    const hash = parameter(keyInsert, "requestHash")!;

    const replayDatabase = new FakeDatabase();
    replayDatabase.idempotencyRows = [];
    replayDatabase.existingIdempotencyRows = [
      {
        request_hash: hash,
        estimate_id: "33333333-3333-3333-3333-333333333333",
      },
    ];
    await expect(
      new EstimateService(replayDatabase).createDraft(
        "cognito-subject",
        REQUEST,
        "request-key-123456",
        "request-id",
      ),
    ).resolves.toEqual({
      estimateId: "33333333-3333-3333-3333-333333333333",
      status: "draft",
      replayed: true,
    });
    expect(replayDatabase.committed).toBe(true);
  });
});

describe("EstimateService optimistic draft update", () => {
  function editableDatabase(): FakeDatabase {
    const database = new FakeDatabase();
    database.lockedEstimateRows = [
      {
        id: DETAIL_ROW.id,
        project_id: DETAIL_ROW.project_id,
        status: "draft",
        row_version: "2",
      },
    ];
    database.updatedEstimateRows = [{ row_version: "3" }];
    database.detailRows = [DETAIL_ROW];
    database.scopeRows = [
      { sort_order: "0", description: "First" },
      { sort_order: "1", description: "Second" },
    ];
    database.pricingRows = [
      { kind: "base", sort_order: "0", description: "Base", amount_minor: "100" },
      { kind: "base", sort_order: "1", description: "Credit", amount_minor: "-25" },
      {
        kind: "alternate",
        sort_order: "0",
        description: "Option",
        amount_minor: "500",
      },
    ];
    return database;
  }

  it("replaces ordered rows, audits, reloads, and commits exact totals", async () => {
    const database = editableDatabase();
    const result = await new EstimateService(
      database,
      () => "55555555-5555-4555-8555-555555555555",
    ).updateDraft(
      "cognito-subject",
      String(DETAIL_ROW.id),
      UPDATE_REQUEST,
      "request-id",
    );

    const update = database.statements.find((statement) =>
      statement.sql.includes("update app.estimates"),
    )!;
    expect(parameter(update, "subtotalMinor")).toBe("75");
    expect(parameter(update, "requiredDepositMinor")).toBe("0");
    expect(parameter(update, "remainingBalanceMinor")).toBe("75");
    const replacement = database.statements.find((statement) =>
      statement.sql.includes("replace_estimate_phase_2_rows"),
    )!;
    expect(JSON.parse(parameter(replacement, "scopeItems")!)).toEqual(
      UPDATE_REQUEST.scopeItems,
    );
    expect(
      database.statements.some((statement) =>
        statement.sql.includes("estimate.draft_updated"),
      ),
    ).toBe(true);
    expect(result.data.rowVersion).toBe("3");
    expect(result.data.scopeItems.map((item) => item.description)).toEqual([
      "First",
      "Second",
    ]);
    expect(result.data.pricingLines.map((item) => item.amountMinor)).toEqual([
      "100",
      "-25",
    ]);
    expect(result.data.alternatePricingLines[0].amountMinor).toBe("500");
    expect(database.committed).toBe(true);
    expect(database.rolledBack).toBe(false);
  });

  it("rejects stale row versions before any update", async () => {
    const database = editableDatabase();
    database.lockedEstimateRows = [
      { ...database.lockedEstimateRows[0], row_version: "3" },
    ];
    await expect(
      new EstimateService(database).updateDraft(
        "cognito-subject",
        String(DETAIL_ROW.id),
        UPDATE_REQUEST,
        "request-id",
      ),
    ).rejects.toMatchObject({ code: "stale_estimate", status: 409 });
    expect(database.rolledBack).toBe(true);
    expect(
      database.statements.some((statement) =>
        statement.sql.includes("update app.estimates"),
      ),
    ).toBe(false);
  });

  it("denies missing or cross-organization estimates without leaking them", async () => {
    const database = editableDatabase();
    database.lockedEstimateRows = [];
    await expect(
      new EstimateService(database).updateDraft(
        "cognito-subject",
        "99999999-9999-4999-8999-999999999999",
        UPDATE_REQUEST,
        "request-id",
      ),
    ).rejects.toMatchObject({ code: "estimate_not_found", status: 404 });
    expect(database.rolledBack).toBe(true);
    expect(
      database.statements.some((statement) =>
        statement.sql.includes("update app.estimates"),
      ),
    ).toBe(false);
  });

  it("rejects issued estimates before any update", async () => {
    const database = editableDatabase();
    database.lockedEstimateRows = [
      { ...database.lockedEstimateRows[0], status: "issued" },
    ];
    await expect(
      new EstimateService(database).updateDraft(
        "cognito-subject",
        String(DETAIL_ROW.id),
        UPDATE_REQUEST,
        "request-id",
      ),
    ).rejects.toMatchObject({ code: "estimate_not_editable", status: 409 });
    expect(database.rolledBack).toBe(true);
  });

  it("rolls back header and child changes when replacement fails", async () => {
    const database = editableDatabase();
    database.failOn = "replace_estimate_phase_2_rows";
    await expect(
      new EstimateService(database).updateDraft(
        "cognito-subject",
        String(DETAIL_ROW.id),
        UPDATE_REQUEST,
        "request-id",
      ),
    ).rejects.toThrow("forced database failure");
    expect(database.rolledBack).toBe(true);
    expect(database.committed).toBe(false);
    expect(
      database.statements.some((statement) =>
        statement.sql.includes("estimate.draft_updated"),
      ),
    ).toBe(false);
  });
});
