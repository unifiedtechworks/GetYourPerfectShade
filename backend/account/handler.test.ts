import { describe, expect, it } from "vitest";
import type {
  SqlRow,
  SqlStatement,
  TransactionDatabase,
} from "../shared/database";
import type {
  CognitoDirectoryUser,
  StaffIdentityDirectory,
} from "./cognito-admin";
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
  profileRows: readonly SqlRow[] = [{
    email_snapshot: "owner@example.com",
    display_name: "Owner",
  }];
  failOnCreateMembership: Error | null = null;

  async beginTransaction() {
    this.began = true;
    return "tx-1";
  }
  async execute(statement: SqlStatement) {
    if (statement.sql.includes("from app.profiles\nwhere user_id")) {
      return this.profileRows;
    }
    if (statement.sql.includes("from app.organization_memberships m\njoin app.profiles")) {
      return [];
    }
    if (statement.sql.includes("create_staff_membership")) {
      if (this.failOnCreateMembership) throw this.failOnCreateMembership;
      return [{
        outcome: "created",
        membership_id: "22222222-2222-4222-8222-222222222222",
        membership_role: "staff",
        membership_status: "active",
      }];
    }
    return this.rows;
  }
  async commitTransaction() {
    this.committed = true;
  }
  async rollbackTransaction() {
    this.rolledBack = true;
  }
}

const directoryUser: CognitoDirectoryUser = {
  subject: "new-staff-sub",
  email: "staff@example.com",
  emailVerified: true,
  status: "FORCE_CHANGE_PASSWORD",
  enabled: true,
  createdAt: null,
  updatedAt: null,
};

class FakeDirectory implements StaffIdentityDirectory {
  async findByEmail() { return null; }
  async create() { return directoryUser; }
  async list() { return [directoryUser]; }
}

function event(
  sub?: string,
  overrides: Partial<Parameters<ReturnType<typeof createAccountHandler>>[0]> = {},
) {
  return {
    ...overrides,
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
      profile: { displayName: "Owner", email: "owner@example.com" },
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

  it("rejects arbitrary owner assignment before Cognito access", async () => {
    const database = new FakeDatabase();
    const result = await createAccountHandler(database, new FakeDirectory())(event(
      "owner-sub",
      {
        routeKey: "POST /v1/account/team/invitations",
        body: JSON.stringify({ email: "staff@example.com", role: "owner" }),
      },
    ));
    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body).error.code).toBe("target_role_forbidden");
    expect(database.began).toBe(false);
  });

  it("keeps raw database and credential-like errors out of responses", async () => {
    const database = new FakeDatabase();
    database.failOnCreateMembership = new Error("TemporaryPassword=DoNotExpose");
    const result = await createAccountHandler(database, new FakeDirectory())(event(
      "owner-sub",
      {
        routeKey: "POST /v1/account/team/invitations",
        body: JSON.stringify({ email: "staff@example.com", role: "staff" }),
      },
    ));
    expect(result.statusCode).toBe(502);
    expect(JSON.parse(result.body).error.code).toBe("cognito_created_database_failed");
    expect(result.body).not.toContain("DoNotExpose");
    expect(result.body).not.toContain("TemporaryPassword");
  });
});
