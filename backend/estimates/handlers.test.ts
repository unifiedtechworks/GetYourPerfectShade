import { describe, expect, it } from "vitest";
import type { EstimateDatabase, SqlStatement } from "./database";
import { createEstimateHandlers, type HttpApiEvent } from "./handlers";

class NoopDatabase implements EstimateDatabase {
  began = false;
  async beginTransaction() {
    this.began = true;
    return "tx";
  }
  async execute(_statement: SqlStatement) {
    return [];
  }
  async commitTransaction() {}
  async rollbackTransaction() {}
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
});
