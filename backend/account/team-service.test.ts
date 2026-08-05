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
import { AccountServiceError } from "./service";
import { TeamService } from "./team-service";

const ownerContext: SqlRow = {
  actor_id: "owner-sub",
  organization_id: "11111111-1111-1111-1111-111111111111",
  organization_name: "Perfect Shade",
  role: "owner",
};

const adminContext: SqlRow = { ...ownerContext, actor_id: "admin-sub", role: "admin" };
const staffContext: SqlRow = { ...ownerContext, actor_id: "staff-sub", role: "staff" };
const membershipId = "22222222-2222-4222-8222-222222222222";

const directoryUser: CognitoDirectoryUser = {
  subject: "new-staff-sub",
  email: "staff@example.com",
  emailVerified: true,
  status: "FORCE_CHANGE_PASSWORD",
  enabled: true,
  createdAt: "2026-08-05T00:00:00.000Z",
  updatedAt: "2026-08-05T00:00:00.000Z",
};

function membershipResult(
  outcome = "created",
  role = "staff",
  status = "active",
): SqlRow {
  return {
    outcome,
    membership_id: membershipId,
    membership_role: role,
    membership_status: status,
    membership_created_at: "2026-08-05T00:00:00.000Z",
    membership_updated_at: "2026-08-05T00:00:00.000Z",
  };
}

class FakeDatabase implements TransactionDatabase {
  readonly statements: SqlStatement[] = [];
  readonly committed: string[] = [];
  readonly rolledBack: string[] = [];
  private transaction = 0;

  constructor(readonly responses: Array<readonly SqlRow[] | Error>) {}

  async beginTransaction() {
    this.transaction += 1;
    return `tx-${this.transaction}`;
  }

  async execute(statement: SqlStatement) {
    this.statements.push(statement);
    const response = this.responses.shift();
    if (response instanceof Error) throw response;
    return response ?? [];
  }

  async commitTransaction(transactionId: string) {
    this.committed.push(transactionId);
  }

  async rollbackTransaction(transactionId: string) {
    this.rolledBack.push(transactionId);
  }
}

class FakeDirectory implements StaffIdentityDirectory {
  findCalls = 0;
  createCalls = 0;
  listCalls = 0;

  constructor(
    readonly existing: CognitoDirectoryUser | null = null,
    readonly created: CognitoDirectoryUser = directoryUser,
    readonly users: readonly CognitoDirectoryUser[] = [directoryUser],
  ) {}

  async findByEmail() {
    this.findCalls += 1;
    return this.existing;
  }

  async create() {
    this.createCalls += 1;
    return this.created;
  }

  async list() {
    this.listCalls += 1;
    return this.users;
  }
}

function service(
  responses: Array<readonly SqlRow[] | Error>,
  directory = new FakeDirectory(),
) {
  const database = new FakeDatabase(responses);
  return { database, directory, service: new TeamService(database, directory) };
}

describe("staff invitation and provisioning", () => {
  it.each([
    ["owner", ownerContext, "admin"],
    ["owner", ownerContext, "staff"],
    ["admin", adminContext, "staff"],
  ] as const)("allows %s to invite %s", async (_actor, context, targetRole) => {
    const test = service([[context], [], [membershipResult("created", targetRole)]]);
    const result = await test.service.invite(
      required(context.actor_id),
      "staff@example.com",
      targetRole,
      "request-1",
      false,
    );

    expect(result).toMatchObject({ role: targetRole, status: "active" });
    expect(test.directory.createCalls).toBe(1);
    expect(test.database.committed).toEqual(["tx-1", "tx-2"]);
  });

  it("prevents an admin from inviting an owner or another admin", async () => {
    const ownerAttempt = service([]);
    await expect(ownerAttempt.service.invite(
      "admin-sub",
      "staff@example.com",
      "owner" as "staff",
      "request-1",
      false,
    )).rejects.toMatchObject({ code: "target_role_forbidden" });

    const adminAttempt = service([[adminContext]]);
    await expect(adminAttempt.service.invite(
      "admin-sub",
      "staff@example.com",
      "admin",
      "request-1",
      false,
    )).rejects.toMatchObject({ code: "target_role_forbidden" });
    expect(adminAttempt.directory.findCalls).toBe(0);
  });

  it("prevents staff from performing membership actions before Cognito access", async () => {
    const test = service([[staffContext]]);
    await expect(test.service.invite(
      "staff-sub",
      "staff@example.com",
      "staff",
      "request-1",
      false,
    )).rejects.toMatchObject({ code: "membership_management_forbidden" });
    expect(test.directory.findCalls).toBe(0);
  });

  it("detects duplicate invitations before Cognito mutation", async () => {
    const test = service([[ownerContext], [{ id: membershipId }]]);
    await expect(test.service.invite(
      "owner-sub",
      "staff@example.com",
      "staff",
      "request-1",
      false,
    )).rejects.toMatchObject({ code: "duplicate_email" });
    expect(test.directory.findCalls).toBe(0);
    expect(test.directory.createCalls).toBe(0);
  });

  it("rejects an existing Cognito user unless recovery is explicit", async () => {
    const directory = new FakeDirectory(directoryUser);
    const test = service([[ownerContext], []], directory);
    await expect(test.service.invite(
      "owner-sub",
      "staff@example.com",
      "staff",
      "request-1",
      false,
    )).rejects.toMatchObject({ code: "existing_cognito_user" });
    expect(directory.createCalls).toBe(0);
  });

  it("supports an idempotent recovery invocation for an already-complete membership", async () => {
    const directory = new FakeDirectory(directoryUser);
    const test = service([
      [ownerContext],
      [{ id: membershipId }],
      [membershipResult("already_complete")],
    ], directory);
    await expect(test.service.invite(
      "owner-sub",
      "staff@example.com",
      "staff",
      "request-1",
      true,
    )).resolves.toMatchObject({ recovered: true, alreadyComplete: true });
    expect(directory.createCalls).toBe(0);
  });

  it("rolls back and reports the partial external-service case without raw errors", async () => {
    const test = service([[ownerContext], [], new Error("db secret leaked")]);
    await expect(test.service.invite(
      "owner-sub",
      "staff@example.com",
      "staff",
      "request-1",
      false,
    )).rejects.toMatchObject({
      code: "cognito_created_database_failed",
      message: expect.not.stringContaining("db secret leaked"),
    });
    expect(test.database.rolledBack).toContain("tx-2");
  });

  it("rolls back database-only recovery failures", async () => {
    const directory = new FakeDirectory(directoryUser);
    const test = service([[ownerContext], [], new Error("database failed")], directory);
    await expect(test.service.invite(
      "owner-sub",
      "staff@example.com",
      "staff",
      "request-1",
      true,
    )).rejects.toThrow("database failed");
    expect(test.database.rolledBack).toContain("tx-2");
  });
});

describe("membership administration", () => {
  it("prevents self-escalation", async () => {
    const test = service([[membershipResult("self_action_forbidden")]]);
    await expect(test.service.changeRole(
      "admin-sub",
      membershipId,
      "admin",
      "request-1",
    )).rejects.toMatchObject({ code: "self_action_forbidden" });
    expect(test.database.rolledBack).toEqual(["tx-1"]);
  });

  it.each(["last_owner_protected", "owner_protected"])(
    "prevents owner demotion or removal with %s",
    async (outcome) => {
      const test = service([[membershipResult(outcome, "owner")]]);
      await expect(test.service.changeStatus(
        "owner-sub",
        membershipId,
        "remove",
        "request-1",
      )).rejects.toMatchObject({ code: outcome });
    },
  );

  it("denies cross-organization targets without revealing them", async () => {
    const test = service([[membershipResult("target_not_found")]]);
    await expect(test.service.changeStatus(
      "owner-sub",
      membershipId,
      "disable",
      "request-1",
    )).rejects.toMatchObject({ code: "target_not_found", status: 404 });
  });

  it("disables and re-enables memberships transactionally", async () => {
    const disabled = service([[membershipResult("updated", "staff", "disabled")]]);
    await expect(disabled.service.changeStatus(
      "owner-sub",
      membershipId,
      "disable",
      "request-1",
    )).resolves.toMatchObject({ status: "disabled" });
    expect(disabled.database.committed).toEqual(["tx-1"]);

    const enabled = service([[membershipResult("updated", "staff", "active")]]);
    await expect(enabled.service.changeStatus(
      "owner-sub",
      membershipId,
      "enable",
      "request-2",
    )).resolves.toMatchObject({ status: "active" });
  });
});

describe("team and profile state", () => {
  it("lists pending invitation and disabled state without exposing Cognito subjects", async () => {
    const test = service([
      [ownerContext],
      [{
        membership_id: membershipId,
        user_id: directoryUser.subject,
        email_snapshot: directoryUser.email,
        display_name: "Seth",
        role: "staff",
        status: "active",
        created_at: "2026-08-05T00:00:00.000Z",
        updated_at: "2026-08-05T00:00:00.000Z",
      }],
    ]);
    const result = await test.service.list("owner-sub");
    expect(result.data[0]).toMatchObject({
      pendingInvitation: true,
      disabled: false,
      cognitoStatus: "FORCE_CHANGE_PASSWORD",
    });
    expect(JSON.stringify(result)).not.toContain(directoryUser.subject);
  });

  it("updates display name in a database transaction", async () => {
    const test = service([[
      { outcome: "updated", display_name: "Seth B", email_snapshot: "owner@example.com" },
    ]]);
    await expect(test.service.updateProfile(
      "owner-sub",
      "Seth B",
      "request-1",
    )).resolves.toEqual({ displayName: "Seth B", email: "owner@example.com" });
    expect(test.database.committed).toEqual(["tx-1"]);
  });
});

function required(value: string | null) {
  if (!value) throw new Error("test fixture is missing a value");
  return value;
}
