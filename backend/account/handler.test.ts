import { describe, expect, it } from "vitest";
import type {
  SqlRow,
  SqlStatement,
  TransactionDatabase,
} from "../shared/database";
import { createAccountHandler } from "./handler";

class FakeDatabase implements TransactionDatabase {
  began = false;
  committed = false;
  rolledBack = false;
  rows: readonly SqlRow[] = [{
    actor_id: "staff-sub",
    organization_id: "11111111-1111-1111-1111-111111111111",
    organization_name: "Perfect Shade",
    role: "owner",
  }];

  async beginTransaction() {
    this.began = true;
    return "tx-1";
  }
  async execute(_statement: SqlStatement) {
    return this.rows;
  }
  async commitTransaction() {
    this.committed = true;
  }
  async rollbackTransaction() {
    this.rolledBack = true;
  }
}

function event(sub?: string) {
  return {
    requestContext: {
      requestId: "request-1",
      ...(sub
        ? { authorizer: { jwt: { claims: { sub } } } }
        : {}),
    },
  };
}

describe("account Lambda handler", () => {
  it("fails before database access when the validated Cognito sub is absent", async () => {
    const database = new FakeDatabase();
    const result = await createAccountHandler(database)(event());
    expect(result.statusCode).toBe(401);
    expect(database.began).toBe(false);
  });

  it("returns the active organization contract derived from the Cognito sub", async () => {
    const database = new FakeDatabase();
    const result = await createAccountHandler(database)(event("staff-sub"));
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      organizationId: "11111111-1111-1111-1111-111111111111",
      organizationName: "Perfect Shade",
      role: "owner",
    });
    expect(database.committed).toBe(true);
  });

  it("fails closed and rolls back when no active membership exists", async () => {
    const database = new FakeDatabase();
    database.rows = [];
    const result = await createAccountHandler(database)(event("staff-sub"));
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error.code).toBe("active_membership_required");
    expect(database.rolledBack).toBe(true);
  });
});
