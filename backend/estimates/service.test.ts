import { describe, expect, it } from "vitest";
import type {
  CreateEstimateDraftRequest,
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
