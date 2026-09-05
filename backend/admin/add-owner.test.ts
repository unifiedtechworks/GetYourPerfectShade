import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AwsAdditionalOwnerCognitoAdapter,
  AwsAdditionalOwnerDatabaseAdapter,
  OwnerProvisioningError,
  parseOwnerProvisioningArguments,
  provisionAdditionalOwner,
  type AdditionalOwnerDatabasePort,
  type OwnerCognitoPort,
  type OwnerDatabaseOutcome,
  type OwnerIdentity,
  type OwnerProvisioningConfiguration,
  type SafeOutput,
} from "./add-owner.mjs";

const configuration: OwnerProvisioningConfiguration = {
  region: "us-west-2",
  userPoolId: "us-west-2_fixture",
  clusterArn: "arn:aws:rds:us-west-2:111122223333:cluster:fixture",
  adminSecretArn: "arn:aws:secretsmanager:us-west-2:111122223333:secret:fixture-admin",
  database: "perfectshade",
  organizationId: "b965e30a-f423-4c6d-a80d-8760552c6e47",
  ownerEmail: "additional-owner@example.com",
  authorizedBySubject: "existing-owner-subject",
  authorizationReference: "approved-change-77",
  resumeExistingUser: false,
  mode: "execute",
};

class FakeCognito implements OwnerCognitoPort {
  createCalls = 0;

  constructor(readonly found: OwnerIdentity | null = null) {}

  async findUser() {
    return this.found;
  }

  async createUser() {
    this.createCalls += 1;
    return { subject: "new-owner-subject", email: configuration.ownerEmail };
  }
}

class FakeDatabase implements AdditionalOwnerDatabasePort {
  readonly calls: { ownerSubject: string | null; apply: boolean }[] = [];

  constructor(private readonly outcomes: (OwnerDatabaseOutcome | Error)[]) {}

  async evaluate(input: { ownerSubject: string | null; apply: boolean }) {
    this.calls.push({ ownerSubject: input.ownerSubject, apply: input.apply });
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

describe("additional owner provisioning service", () => {
  it("creates one Cognito identity and atomically provisions the second owner", async () => {
    const cognito = new FakeCognito();
    const database = new FakeDatabase(["ready", "created"]);
    const logs = output();

    await expect(provisionAdditionalOwner(configuration, {
      cognito,
      database,
      output: logs.value,
      requestId: () => "request-1",
    })).resolves.toBe("created");

    expect(cognito.createCalls).toBe(1);
    expect(database.calls).toEqual([
      { ownerSubject: null, apply: false },
      { ownerSubject: "new-owner-subject", apply: true },
    ]);
    expect(logs.messages.join(" ")).toMatch(/first-login.*MFA/i);
  });

  it("treats duplicate execution as an idempotent no-op", async () => {
    const cognito = new FakeCognito({
      subject: "existing-additional-owner",
      email: configuration.ownerEmail,
    });
    const logs = output();
    await expect(provisionAdditionalOwner(configuration, {
      cognito,
      database: new FakeDatabase(["already_complete"]),
      output: logs.value,
    })).resolves.toBe("already_complete");
    expect(cognito.createCalls).toBe(0);
    expect(logs.messages.join(" ")).toContain("already complete");
  });

  it("requires an explicit resume path for an existing Cognito identity", async () => {
    const cognito = new FakeCognito({
      subject: "existing-cognito-subject",
      email: configuration.ownerEmail,
    });
    await expect(provisionAdditionalOwner(configuration, {
      cognito,
      database: new FakeDatabase(["ready"]),
      output: output().value,
    })).rejects.toMatchObject({ code: "existing_cognito_user", exitCode: 3 });
    expect(cognito.createCalls).toBe(0);
  });

  it("resumes a verified existing Cognito identity without creating another", async () => {
    const cognito = new FakeCognito({
      subject: "existing-cognito-subject",
      email: configuration.ownerEmail,
    });
    const database = new FakeDatabase(["ready", "created"]);
    await expect(provisionAdditionalOwner(
      { ...configuration, resumeExistingUser: true },
      { cognito, database, output: output().value },
    )).resolves.toBe("created");
    expect(cognito.createCalls).toBe(0);
    expect(database.calls[1]).toEqual({
      ownerSubject: "existing-cognito-subject",
      apply: true,
    });
  });

  it.each([
    ["organization_missing", /does not exist/i],
    ["no_active_owner", /does not have an active existing owner/i],
    ["authorization_required", /not an active owner/i],
    ["cross_organization_conflict", /another organization/i],
    ["identity_conflict", /conflicts/i],
  ] as const)("stops safely for %s before Cognito mutation", async (outcome, message) => {
    const cognito = new FakeCognito();
    await expect(provisionAdditionalOwner(configuration, {
      cognito,
      database: new FakeDatabase([outcome]),
      output: output().value,
    })).rejects.toThrow(message);
    expect(cognito.createCalls).toBe(0);
  });

  it("supports a non-mutating preflight", async () => {
    const cognito = new FakeCognito();
    const database = new FakeDatabase(["ready"]);
    await expect(provisionAdditionalOwner(
      { ...configuration, mode: "preflight" },
      { cognito, database, output: output().value },
    )).resolves.toBe("ready");
    expect(cognito.createCalls).toBe(0);
    expect(database.calls).toEqual([{ ownerSubject: null, apply: false }]);
  });

  it("validates dry-run configuration without contacting AWS", async () => {
    const cognito = new FakeCognito();
    const database = new FakeDatabase([]);
    await expect(provisionAdditionalOwner(
      { ...configuration, mode: "dry-run" },
      { cognito, database, output: output().value },
    )).resolves.toBe("dry_run");
    expect(cognito.createCalls).toBe(0);
    expect(database.calls).toEqual([]);
  });

  it("reports Cognito success/database failure without exposing sensitive values", async () => {
    const logs = output();
    let failure: OwnerProvisioningError | undefined;
    try {
      await provisionAdditionalOwner(configuration, {
        cognito: new FakeCognito(),
        database: new FakeDatabase(["ready", new Error("secret=NeverPrintThis")]),
        output: logs.value,
      });
    } catch (error) {
      failure = error as OwnerProvisioningError;
    }
    expect(failure).toMatchObject({ code: "partial_external_failure", exitCode: 4 });
    const rendered = `${failure?.message} ${logs.messages.join(" ")}`;
    expect(rendered).not.toContain("NeverPrintThis");
    expect(rendered).not.toContain(configuration.adminSecretArn);
    expect(rendered).not.toContain(configuration.ownerEmail);
  });
});

describe("additional owner input boundary", () => {
  const environment = {
    AWS_REGION: configuration.region,
    COGNITO_USER_POOL_ID: configuration.userPoolId,
    DATABASE_CLUSTER_ARN: configuration.clusterArn,
    DATABASE_ADMIN_SECRET_ARN: configuration.adminSecretArn,
    DATABASE_NAME: configuration.database,
    OWNER_ORGANIZATION_ID: configuration.organizationId,
    ADDITIONAL_OWNER_EMAIL: configuration.ownerEmail,
    AUTHORIZING_OWNER_SUB: configuration.authorizedBySubject,
    OWNER_AUTHORIZATION_REFERENCE: configuration.authorizationReference,
  };

  it("accepts only the finalized administrative database contract", () => {
    expect(parseOwnerProvisioningArguments(["--dry-run"], environment)).toEqual({
      ...configuration,
      mode: "dry-run",
    });
    expect(() => parseOwnerProvisioningArguments(["--dry-run"], {
      ...environment,
      DATABASE_ADMIN_SECRET_ARN: undefined,
      DATABASE_RUNTIME_SECRET_ARN: configuration.adminSecretArn,
    })).toThrow(/admin\/migration secret ARN is required/i);
  });

  it("rejects the runtime-secret path", () => {
    expect(() => parseOwnerProvisioningArguments(["--dry-run"], {
      ...environment,
      DATABASE_ADMIN_SECRET_ARN:
        "arn:aws:secretsmanager:us-west-2:111122223333:secret:perfect-shade-production/aurora/runtime-AbCdEf",
    })).toThrow(/runtime secret cannot provision an owner/i);
  });

  it("fails closed for missing configuration or execution mode", () => {
    expect(() => parseOwnerProvisioningArguments(["--execute"], {})).toThrowError(
      OwnerProvisioningError,
    );
    expect(() => parseOwnerProvisioningArguments([], environment)).toThrow(/exactly one/i);
    expect(() => parseOwnerProvisioningArguments(
      ["--dry-run", "--execute"],
      environment,
    )).toThrow(/exactly one/i);
  });

  it.each(["--role", "--password", "--temporary-password"])(
    "does not accept the unsafe option %s",
    (option) => {
      expect(() => parseOwnerProvisioningArguments(
        ["--dry-run", option, "owner"],
        environment,
      )).toThrow(/Password and role selection are not permitted/i);
    },
  );
});

describe("additional owner AWS adapters", () => {
  it("verifies an existing enabled Cognito identity and its immutable subject", async () => {
    const adapter = new AwsAdditionalOwnerCognitoAdapter({
      async send() {
        return {
          Enabled: true,
          UserStatus: "CONFIRMED",
          UserAttributes: [
            { Name: "sub", Value: "verified-subject" },
            { Name: "email", Value: configuration.ownerEmail },
            { Name: "email_verified", Value: "true" },
          ],
        };
      },
    });
    await expect(adapter.findUser(
      configuration.userPoolId,
      configuration.ownerEmail,
    )).resolves.toEqual({
      subject: "verified-subject",
      email: configuration.ownerEmail,
    });
  });

  it("rejects a disabled or unverified existing Cognito identity", async () => {
    const adapter = new AwsAdditionalOwnerCognitoAdapter({
      async send() {
        return {
          Enabled: false,
          UserStatus: "CONFIRMED",
          UserAttributes: [
            { Name: "sub", Value: "ineligible-subject" },
            { Name: "email", Value: configuration.ownerEmail },
            { Name: "email_verified", Value: "false" },
          ],
        };
      },
    });
    await expect(adapter.findUser(
      configuration.userPoolId,
      configuration.ownerEmail,
    )).rejects.toMatchObject({ code: "cognito_identity_mismatch" });
  });

  it("uses AdminCreateUser email delivery without a supplied password or role", async () => {
    const commands: unknown[] = [];
    const adapter = new AwsAdditionalOwnerCognitoAdapter({
      async send(command: unknown) {
        commands.push(command);
        return {
          User: { Attributes: [
            { Name: "sub", Value: "created-subject" },
            { Name: "email", Value: configuration.ownerEmail },
          ] },
        };
      },
    });
    await adapter.createUser(configuration.userPoolId, configuration.ownerEmail);
    const input = (commands[0] as { input: Record<string, unknown> }).input;
    expect(commands[0]?.constructor?.name).toBe("AdminCreateUserCommand");
    expect(input.DesiredDeliveryMediums).toEqual(["EMAIL"]);
    expect(input).not.toHaveProperty("TemporaryPassword");
    expect(input).not.toHaveProperty("Role");
  });

  it("executes the administrative function in an explicit transaction", async () => {
    const commands: unknown[] = [];
    const adapter = new AwsAdditionalOwnerDatabaseAdapter(configuration, {
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
      organizationId: configuration.organizationId,
      ownerSubject: "new-owner-subject",
      ownerEmail: configuration.ownerEmail,
      authorizedBySubject: configuration.authorizedBySubject,
      authorizationReference: configuration.authorizationReference,
      requestId: "request-1",
      apply: true,
    })).resolves.toBe("created");
    expect(commands.map((command) => command?.constructor?.name)).toEqual([
      "BeginTransactionCommand",
      "ExecuteStatementCommand",
      "CommitTransactionCommand",
    ]);
    const execute = commands[1] as { input: { sql: string; secretArn: string } };
    expect(execute.input.sql).toContain("app_private.provision_additional_owner");
    expect(execute.input.secretArn).toBe(configuration.adminSecretArn);
  });

  it("rolls back database failure and keeps the underlying error secret-safe", async () => {
    const commands: unknown[] = [];
    const adapter = new AwsAdditionalOwnerDatabaseAdapter(configuration, {
      async send(command: unknown) {
        commands.push(command);
        if (command?.constructor?.name === "BeginTransactionCommand") {
          return { transactionId: "tx-1" };
        }
        if (command?.constructor?.name === "ExecuteStatementCommand") {
          throw new Error("credential=NeverPrintThis");
        }
        return {};
      },
    });
    let failure: OwnerProvisioningError | undefined;
    try {
      await adapter.evaluate({
        organizationId: configuration.organizationId,
        ownerSubject: null,
        ownerEmail: configuration.ownerEmail,
        authorizedBySubject: configuration.authorizedBySubject,
        authorizationReference: configuration.authorizationReference,
        requestId: "request-1",
        apply: false,
      });
    } catch (error) {
      failure = error as OwnerProvisioningError;
    }
    expect(commands.map((command) => command?.constructor?.name)).toEqual([
      "BeginTransactionCommand",
      "ExecuteStatementCommand",
      "RollbackTransactionCommand",
    ]);
    expect(failure?.message).not.toContain("NeverPrintThis");
  });

  it("reports the required 0009 migration without exposing raw database output", async () => {
    const adapter = new AwsAdditionalOwnerDatabaseAdapter(configuration, {
      async send(command: unknown) {
        if (command?.constructor?.name === "BeginTransactionCommand") {
          return { transactionId: "tx-1" };
        }
        if (command?.constructor?.name === "ExecuteStatementCommand") {
          throw new Error(
            "function app_private.provision_additional_owner does not exist (SQLSTATE 42883)",
          );
        }
        return {};
      },
    });
    await expect(adapter.evaluate({
      organizationId: configuration.organizationId,
      ownerSubject: null,
      ownerEmail: configuration.ownerEmail,
      authorizedBySubject: configuration.authorizedBySubject,
      authorizationReference: configuration.authorizationReference,
      requestId: "request-1",
      apply: false,
    })).rejects.toMatchObject({
      code: "missing_migration",
      message: expect.stringContaining("0009_additional_owner_provisioning.sql"),
    });
  });
});

describe("additional owner migration security", () => {
  const migration = readFileSync(join(
    process.cwd(),
    "infra/database/migrations/0009_additional_owner_provisioning.sql",
  ), "utf8");
  const handler = readFileSync(join(process.cwd(), "backend/account/handler.ts"), "utf8");
  const teamService = readFileSync(join(process.cwd(), "backend/account/team-service.ts"), "utf8");
  const teamPage = readFileSync(join(process.cwd(), "app/app/account/team/page.tsx"), "utf8");

  it("hard-codes owner creation and records one append-only audit action", () => {
    expect(migration).toContain("'owner'");
    expect(migration).not.toContain("target_role");
    expect(migration).toContain("insert into app.profiles");
    expect(migration).toContain("insert into app.organization_memberships");
    expect(migration).toContain("insert into app.audit_events");
    expect(migration).toContain("organization.additional_owner_provisioned");
  });

  it("requires an existing organization, active owner, and exact owner authorization", () => {
    expect(migration).toContain("organization_missing");
    expect(migration).toContain("active_owner_count < 1");
    expect(migration).toContain("authorizer_role is distinct from 'owner'");
    expect(migration).toContain("authorizer_status is distinct from 'active'");
    expect(migration).toContain("m.organization_id = expected_organization_id");
    expect(migration).toContain("cross_organization_conflict");
  });

  it("serializes duplicate attempts and denies runtime-role execution", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("already_complete");
    expect(migration).toMatch(/revoke all on function[\s\S]+from public/);
    expect(migration).toMatch(/revoke all on function[\s\S]+from perfect_shade_app_runtime/);
    expect(migration).not.toMatch(/grant execute[\s\S]+perfect_shade_app_runtime/);
  });

  it("leaves owner unavailable to the normal account API and Team workflow", () => {
    expect(handler).toContain("Only admin or staff may be selected");
    expect(teamService).toContain('targetRole !== "admin" && targetRole !== "staff"');
    expect(teamPage).not.toContain('<option value="owner">');
    expect(handler).not.toContain("provision_additional_owner");
    expect(teamService).not.toContain("provision_additional_owner");
  });
});
