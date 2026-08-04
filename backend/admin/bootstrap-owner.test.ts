import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AwsCognitoBootstrapAdapter,
  AwsOwnerBootstrapDatabaseAdapter,
  BootstrapError,
  bootstrapInitialOwner,
  parseBootstrapArguments,
  type BootstrapConfiguration,
  type CognitoBootstrapPort,
  type DatabaseOutcome,
  type OwnerBootstrapDatabasePort,
  type SafeOutput,
  type StaffUser,
} from "./bootstrap-owner.mjs";

const configuration: BootstrapConfiguration = {
  region: "us-west-2",
  userPoolId: "us-west-2_fixture",
  clusterArn: "arn:aws:rds:us-west-2:111122223333:cluster:fixture",
  secretArn: "arn:aws:secretsmanager:us-west-2:111122223333:secret:fixture",
  database: "perfectshade",
  ownerEmail: "owner@example.com",
  organizationName: "Perfect Shade",
  dryRun: false,
  resumeExistingUser: false,
};

class FakeCognito implements CognitoBootstrapPort {
  createCalls = 0;

  constructor(readonly found: StaffUser | null = null) {}

  async findUser() {
    return this.found;
  }

  async createUser() {
    this.createCalls += 1;
    return { sub: "new-owner-sub", email: configuration.ownerEmail };
  }
}

class FakeDatabase implements OwnerBootstrapDatabasePort {
  readonly calls: { ownerSubject: string | null; allowCreate: boolean }[] = [];

  constructor(readonly outcomes: (DatabaseOutcome | Error)[]) {}

  async evaluate(input: { ownerSubject: string | null; allowCreate: boolean }) {
    this.calls.push({ ownerSubject: input.ownerSubject, allowCreate: input.allowCreate });
    const outcome = this.outcomes.shift();
    if (outcome instanceof Error) throw outcome;
    if (!outcome) throw new Error("missing fake outcome");
    return outcome;
  }
}

function output() {
  const messages: string[] = [];
  const value: SafeOutput = {
    info: (message) => messages.push(message),
    error: (message) => messages.push(message),
  };
  return { value, messages };
}

describe("initial owner bootstrap service", () => {
  it("creates one Cognito user and atomically bootstraps the database", async () => {
    const cognito = new FakeCognito();
    const database = new FakeDatabase(["creation_required", "created"]);
    const logs = output();

    await expect(bootstrapInitialOwner(configuration, {
      cognito,
      database,
      output: logs.value,
      requestId: () => "request-1",
    })).resolves.toBe("created");

    expect(cognito.createCalls).toBe(1);
    expect(database.calls).toEqual([
      { ownerSubject: null, allowCreate: false },
      { ownerSubject: "new-owner-sub", allowCreate: true },
    ]);
    expect(logs.messages.join(" ")).toContain("permanent password");
  });

  it("stops on an existing Cognito user unless recovery is explicit", async () => {
    const cognito = new FakeCognito({
      sub: "existing-sub",
      email: configuration.ownerEmail,
    });
    const database = new FakeDatabase(["creation_required"]);

    await expect(bootstrapInitialOwner(configuration, {
      cognito,
      database,
      output: output().value,
    })).rejects.toMatchObject({ code: "existing_cognito_user", exitCode: 3 });
    expect(cognito.createCalls).toBe(0);
  });

  it.each(["existing_organization", "existing_owner", "existing_membership"] as const)(
    "stops without Cognito mutation for %s",
    async (databaseOutcome) => {
      const cognito = new FakeCognito();
      const database = new FakeDatabase([databaseOutcome]);
      await expect(bootstrapInitialOwner(configuration, {
        cognito,
        database,
        output: output().value,
      })).rejects.toMatchObject({ code: "duplicate_database_state", exitCode: 3 });
      expect(cognito.createCalls).toBe(0);
    },
  );

  it("treats a duplicate completed invocation as a safe no-op", async () => {
    const cognito = new FakeCognito({
      sub: "existing-sub",
      email: configuration.ownerEmail,
    });
    const logs = output();
    await expect(bootstrapInitialOwner(configuration, {
      cognito,
      database: new FakeDatabase(["already_complete"]),
      output: logs.value,
    })).resolves.toBe("already_complete");
    expect(logs.messages.join(" ")).toContain("already complete");
    expect(cognito.createCalls).toBe(0);
  });

  it("resumes a documented Cognito-only partial failure", async () => {
    const cognito = new FakeCognito({
      sub: "existing-sub",
      email: configuration.ownerEmail,
    });
    const database = new FakeDatabase(["creation_required", "created"]);
    await expect(bootstrapInitialOwner(
      { ...configuration, resumeExistingUser: true },
      { cognito, database, output: output().value },
    )).resolves.toBe("created");
    expect(cognito.createCalls).toBe(0);
    expect(database.calls[1]).toEqual({ ownerSubject: "existing-sub", allowCreate: true });
  });

  it("reports Cognito success followed by database failure without leaking secrets", async () => {
    const logs = output();
    const database = new FakeDatabase([
      "creation_required",
      new Error("temporary-password=NeverPrintThis"),
    ]);
    let failure: BootstrapError | undefined;
    try {
      await bootstrapInitialOwner(configuration, {
        cognito: new FakeCognito(),
        database,
        output: logs.value,
      });
    } catch (error) {
      failure = error as BootstrapError;
    }
    expect(failure).toMatchObject({ code: "partial_external_failure", exitCode: 4 });
    const rendered = `${failure?.message} ${logs.messages.join(" ")}`;
    expect(rendered).not.toContain("NeverPrintThis");
    expect(rendered).not.toContain(configuration.secretArn);
    expect(rendered).not.toContain(configuration.ownerEmail);
  });

  it("validates dry-run input without calling AWS adapters", async () => {
    const cognito = new FakeCognito();
    const database = new FakeDatabase([]);
    await expect(bootstrapInitialOwner(
      { ...configuration, dryRun: true },
      { cognito, database, output: output().value },
    )).resolves.toBe("dry_run");
    expect(cognito.createCalls).toBe(0);
    expect(database.calls).toEqual([]);
  });
});

describe("owner bootstrap input boundary", () => {
  it("fails closed when required configuration is missing", () => {
    expect(() => parseBootstrapArguments([], {})).toThrowError(BootstrapError);
  });

  it("rejects invalid email input", () => {
    expect(() => parseBootstrapArguments([], {
      AWS_REGION: configuration.region,
      COGNITO_USER_POOL_ID: configuration.userPoolId,
      DATABASE_CLUSTER_ARN: configuration.clusterArn,
      DATABASE_SECRET_ARN: configuration.secretArn,
      DATABASE_NAME: configuration.database,
      OWNER_EMAIL: "not-an-email",
      ORGANIZATION_NAME: configuration.organizationName,
    })).toThrowError(/email is invalid/i);
  });

  it("uses the migration runner's canonical Aurora environment names", () => {
    expect(parseBootstrapArguments([], {
      AWS_REGION: configuration.region,
      COGNITO_USER_POOL_ID: configuration.userPoolId,
      AURORA_CLUSTER_ARN: configuration.clusterArn,
      AURORA_SECRET_ARN: configuration.secretArn,
      AURORA_DATABASE_NAME: configuration.database,
      OWNER_EMAIL: configuration.ownerEmail,
      ORGANIZATION_NAME: configuration.organizationName,
    })).toMatchObject({
      clusterArn: configuration.clusterArn,
      secretArn: configuration.secretArn,
      database: configuration.database,
    });
  });

  it("retains the documented legacy Aurora environment aliases", () => {
    expect(parseBootstrapArguments([], {
      AWS_REGION: configuration.region,
      COGNITO_USER_POOL_ID: configuration.userPoolId,
      DATABASE_CLUSTER_ARN: configuration.clusterArn,
      DATABASE_SECRET_ARN: configuration.secretArn,
      DATABASE_NAME: configuration.database,
      OWNER_EMAIL: configuration.ownerEmail,
      ORGANIZATION_NAME: configuration.organizationName,
    })).toMatchObject({
      clusterArn: configuration.clusterArn,
      secretArn: configuration.secretArn,
      database: configuration.database,
    });
  });

  it("does not permit arbitrary role assignment", () => {
    expect(() => parseBootstrapArguments(["--role", "admin"], {})).toThrowError(
      /Role selection is not permitted/,
    );
  });
});

describe("AWS adapters", () => {
  it("uses AdminCreateUser with verified email and no caller-supplied password", async () => {
    const commands: unknown[] = [];
    const adapter = new AwsCognitoBootstrapAdapter({
      async send(command: unknown) {
        commands.push(command);
        return {
          User: {
            Attributes: [
              { Name: "sub", Value: "created-sub" },
              { Name: "email", Value: configuration.ownerEmail },
            ],
          },
        };
      },
    });

    await adapter.createUser(configuration.userPoolId, configuration.ownerEmail);
    const input = (commands[0] as { input: Record<string, unknown> }).input;
    expect(commands[0]?.constructor?.name).toBe("AdminCreateUserCommand");
    expect(input).not.toHaveProperty("TemporaryPassword");
    expect(input).not.toHaveProperty("Role");
    expect(input.UserAttributes).toContainEqual({ Name: "email_verified", Value: "true" });
  });

  it("executes bootstrap through an explicit Data API transaction", async () => {
    const commands: unknown[] = [];
    const adapter = new AwsOwnerBootstrapDatabaseAdapter(configuration, {
      async send(command: unknown) {
        commands.push(command);
        if (command?.constructor?.name === "BeginTransactionCommand") {
          return { transactionId: "tx-1" };
        }
        if (command?.constructor?.name === "ExecuteStatementCommand") {
          return { formattedRecords: JSON.stringify([{ outcome: "created" }]) };
        }
        return {};
      },
    });

    await expect(adapter.evaluate({
      ownerSubject: "owner-sub",
      ownerEmail: configuration.ownerEmail,
      organizationName: configuration.organizationName,
      requestId: "request-1",
      allowCreate: true,
    })).resolves.toBe("created");
    expect(commands.map((command) => command?.constructor?.name)).toEqual([
      "BeginTransactionCommand",
      "ExecuteStatementCommand",
      "CommitTransactionCommand",
    ]);
    const sql = (commands[1] as { input: { sql: string } }).input.sql;
    expect(sql).toContain("app_private.bootstrap_initial_owner");
  });

  it("rolls back the Data API transaction when bootstrap SQL fails", async () => {
    const commands: unknown[] = [];
    const adapter = new AwsOwnerBootstrapDatabaseAdapter(configuration, {
      async send(command: unknown) {
        commands.push(command);
        if (command?.constructor?.name === "BeginTransactionCommand") {
          return { transactionId: "tx-1" };
        }
        if (command?.constructor?.name === "ExecuteStatementCommand") {
          throw new Error("database rejected fixture");
        }
        return {};
      },
    });

    await expect(adapter.evaluate({
      ownerSubject: "owner-sub",
      ownerEmail: configuration.ownerEmail,
      organizationName: configuration.organizationName,
      requestId: "request-1",
      allowCreate: true,
    })).rejects.toMatchObject({ code: "database_failed" });
    expect(commands.map((command) => command?.constructor?.name)).toEqual([
      "BeginTransactionCommand",
      "ExecuteStatementCommand",
      "RollbackTransactionCommand",
    ]);
  });

  it("reports an actionable error when migration 0003 is missing", async () => {
    const commands: unknown[] = [];
    const adapter = new AwsOwnerBootstrapDatabaseAdapter(configuration, {
      async send(command: unknown) {
        commands.push(command);
        if (command?.constructor?.name === "BeginTransactionCommand") {
          return { transactionId: "tx-1" };
        }
        if (command?.constructor?.name === "ExecuteStatementCommand") {
          throw new Error(
            "ERROR: function app_private.bootstrap_initial_owner does not exist (SQLSTATE 42883)",
          );
        }
        return {};
      },
    });

    await expect(adapter.evaluate({
      ownerSubject: null,
      ownerEmail: configuration.ownerEmail,
      organizationName: configuration.organizationName,
      requestId: "request-1",
      allowCreate: false,
    })).rejects.toMatchObject({
      code: "missing_bootstrap_migration",
      message: expect.stringContaining("0003_initial_owner_bootstrap.sql"),
    });
    expect(commands.map((command) => command?.constructor?.name)).toEqual([
      "BeginTransactionCommand",
      "ExecuteStatementCommand",
      "RollbackTransactionCommand",
    ]);
  });
});

describe("owner bootstrap migration", () => {
  const sql = readFileSync(join(
    process.cwd(),
    "infra/database/migrations/0003_initial_owner_bootstrap.sql",
  ), "utf8");

  it("creates profile, organization, owner membership, and audit records", () => {
    expect(sql).toContain("insert into app.organizations");
    expect(sql).toContain("insert into app.profiles");
    expect(sql).toContain("insert into app.organization_memberships");
    expect(sql).toContain("'owner'");
    expect(sql).toContain("insert into app.audit_events");
    expect(sql).toContain("organization.initial_owner_bootstrapped");
  });

  it("serializes duplicate attempts and withholds access from the runtime role", () => {
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("existing_owner");
    expect(sql).toContain("already_complete");
    expect(sql).toMatch(/revoke all on function[\s\S]+perfect_shade_app_runtime/);
  });
});
