import { describe, expect, it } from "vitest";
import type { EstimateDatabase, SqlRow, SqlStatement } from "./database";
import { createEstimateHandlers, type HttpApiEvent } from "./handlers";

class NoopDatabase implements EstimateDatabase {
  began = false;
  async beginTransaction() {
    this.began = true;
    return "tx";
  }
  async execute(_statement: SqlStatement): Promise<readonly SqlRow[]> {
    return [];
  }
  async commitTransaction() {}
  async rollbackTransaction() {}
}

class DetailDatabase extends NoopDatabase {
  override async execute(statement: SqlStatement): Promise<readonly SqlRow[]> {
    if (statement.sql.includes("establish_estimate_context")) {
      return [
        {
          actor_id: "trusted-subject",
          organization_id: "11111111-1111-4111-8111-111111111111",
          role: "staff",
        },
      ];
    }
    if (statement.sql.includes("join app.projects")) {
      return [
        {
          id: "22222222-2222-4222-8222-222222222222",
          customer_id: "33333333-3333-4333-8333-333333333333",
          customer_name: "Acme",
          project_id: "44444444-4444-4444-8444-444444444444",
          document_type: "Bid Proposal",
          estimate_number: "",
          estimate_date: "",
          valid_through: "",
          bid_due: "",
          project_name: "Atrium",
          project_location: "Portland",
          prepared_for: "Morgan",
          contact_information: "",
          status: "draft",
          revision_number: "1",
          row_version: "1",
          deposit_percent: "0",
          tax_rate_percent: "0",
          include_alternate_pricing: "false",
          include_prevailing_wage_statement: "false",
          prevailing_wage_statement:
            "Applicable prevailing wage labor rates are included where required by the project.",
          lead_time: "",
          pricing_valid_days: "",
          project_notes: "",
          subtotal_minor: "100",
          sales_tax_minor: "0",
          total_minor: "100",
          required_deposit_minor: "0",
          remaining_balance_minor: "100",
          created_by: "trusted-subject",
          updated_by: "trusted-subject",
          created_at: "2026-08-05T00:00:00Z",
          updated_at: "2026-08-05T00:00:00Z",
        },
      ];
    }
    if (statement.sql.includes("from app.estimate_scope_items")) return [];
    if (statement.sql.includes("from app.estimate_pricing_lines")) {
      return [
        {
          kind: "base",
          sort_order: "0",
          description: "Base",
          amount_minor: "100",
        },
      ];
    }
    return [];
  }
}

function event(overrides: Partial<HttpApiEvent> = {}): HttpApiEvent {
  return {
    body: null,
    headers: {},
    queryStringParameters: null,
    requestContext: { requestId: "request-1" },
    ...overrides,
  };
}

describe("estimate Lambda handlers", () => {
  it("fails closed when API Gateway did not supply a validated sub", async () => {
    const database = new NoopDatabase();
    const result = await createEstimateHandlers(database).list(event());
    expect(result.statusCode).toBe(401);
    expect(JSON.parse(result.body)).toEqual({
      error: {
        code: "authentication_required",
        message: "Authentication is required.",
        requestId: "request-1",
      },
    });
    expect(database.began).toBe(false);
  });

  it("rejects bigint JSON numbers before opening a transaction", async () => {
    const database = new NoopDatabase();
    const result = await createEstimateHandlers(database).createDraft(
      event({
        headers: { "idempotency-key": "request-key-123456" },
        body: JSON.stringify({
          customerName: "Acme",
          projectName: "Atrium",
          projectLocation: "",
          preparedFor: "Morgan",
          contactInformation: "",
          documentType: "Bid Proposal",
          estimateNumber: "",
          pricingDescription: "",
          pricingAmountMinor: 100,
          depositPercent: "0",
        }),
        requestContext: {
          requestId: "request-1",
          authorizer: { jwt: { claims: { sub: "trusted-subject" } } },
        },
      }),
    );
    expect(result.statusCode).toBe(400);
    expect(JSON.parse(result.body).error.code).toBe("invalid_request");
    expect(database.began).toBe(false);
  });

  it("rejects non-canonical negative zero money", async () => {
    const database = new NoopDatabase();
    const result = await createEstimateHandlers(database).createDraft(
      event({
        headers: { "idempotency-key": "request-key-123456" },
        body: JSON.stringify({
          customerName: "Acme",
          projectName: "Atrium",
          preparedFor: "Morgan",
          documentType: "Bid Proposal",
          pricingAmountMinor: "-0",
          depositPercent: "0",
        }),
        requestContext: {
          requestId: "request-1",
          authorizer: { jwt: { claims: { sub: "trusted-subject" } } },
        },
      }),
    );
    expect(result.statusCode).toBe(400);
    expect(database.began).toBe(false);
  });

  it("rejects caller-supplied tenant context", async () => {
    const database = new NoopDatabase();
    const result = await createEstimateHandlers(database).createDraft(
      event({
        headers: { "Idempotency-Key": "request-key-123456" },
        body: JSON.stringify({
          organizationId: "attacker-org",
          customerName: "Acme",
          projectName: "Atrium",
          preparedFor: "Morgan",
          documentType: "Bid Proposal",
          pricingAmountMinor: "100",
          depositPercent: "0",
        }),
        requestContext: {
          requestId: "request-1",
          authorizer: { jwt: { claims: { sub: "trusted-subject" } } },
        },
      }),
    );
    expect(result.statusCode).toBe(400);
    expect(result.body).not.toContain("attacker-org");
    expect(database.began).toBe(false);
  });

  it("protects estimate-detail routes before database access", async () => {
    const database = new NoopDatabase();
    const handlers = createEstimateHandlers(database);
    const detailEvent = event({
      pathParameters: {
        estimateId: "22222222-2222-4222-8222-222222222222",
      },
    });
    expect((await handlers.get(detailEvent)).statusCode).toBe(401);
    expect((await handlers.updateDraft(detailEvent)).statusCode).toBe(401);
    expect(database.began).toBe(false);
  });

  it("returns the canonical editable estimate response", async () => {
    const result = await createEstimateHandlers(new DetailDatabase()).get(
      event({
        pathParameters: {
          estimateId: "22222222-2222-4222-8222-222222222222",
        },
        requestContext: {
          requestId: "request-1",
          authorizer: { jwt: { claims: { sub: "trusted-subject" } } },
        },
      }),
    );
    expect(result.statusCode).toBe(200);
    const body = JSON.parse(result.body);
    expect(body.data).toMatchObject({
      id: "22222222-2222-4222-8222-222222222222",
      rowVersion: "1",
      totals: {
        totalMinor: "100",
        alternateTotalMinor: "0",
      },
    });
    expect(body.data).not.toHaveProperty("organizationId");
  });

  it("rejects malformed update money and caller-supplied organization context", async () => {
    const database = new NoopDatabase();
    const result = await createEstimateHandlers(database).updateDraft(
      event({
        pathParameters: {
          estimateId: "22222222-2222-4222-8222-222222222222",
        },
        body: JSON.stringify({
          organizationId: "attacker-org",
          expectedRowVersion: "1",
          documentType: "Bid Proposal",
          projectName: "Atrium",
          preparedFor: "Morgan",
          depositPercent: "0",
          includeAlternatePricing: false,
          scopeItems: [],
          pricingLines: [{ description: "Base", amountMinor: 100 }],
          alternatePricingLines: [],
        }),
        requestContext: {
          requestId: "request-1",
          authorizer: { jwt: { claims: { sub: "trusted-subject" } } },
        },
      }),
    );
    expect(result.statusCode).toBe(400);
    expect(result.body).not.toContain("attacker-org");
    expect(database.began).toBe(false);
  });
});
