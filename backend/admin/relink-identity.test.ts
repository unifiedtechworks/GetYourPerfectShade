import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  AwsRecoveryCognitoAdapter,
  AwsRecoveryDatabaseAdapter,
  RecoveryError,
  parseRecoveryArguments,
  recoverStaffIdentity,
  type RecoveryCognitoPort,
  type RecoveryConfiguration,
  type RecoveryDatabaseOutcome,
  type RecoveryDatabasePort,
  type SafeOutput,
} from "./relink-identity.mjs";

const configuration: RecoveryConfiguration = {
  region: "us-west-2",
  userPoolId: "us-west-2_fixture",
  clusterArn: "arn:aws:rds:us-west-2:111122223333:cluster:fixture",
  adminSecretArn: "arn:aws:secretsmanager:us-west-2:111122223333:secret:fixture-admin",
  database: "perfectshade",
  organizationId: "b965e30a-f423-4c6d-a80d-8760552c6e47",
  staffEmail: "staff@example.com",
  oldSubject: "old-subject",
  newSubject: "new-subject",
  authorizedBySubject: "owner-subject",
  authorizationReference: "approved-change-42",
  mode: "execute",
};

class FakeCognito implements RecoveryCognitoPort {
  calls = 0;
  async verifyReplacement() {
    this.calls += 1;
  }
}

class FakeDatabase implements RecoveryDatabasePort {
  calls: { apply: boolean; organizationId: string }[] = [];
  constructor(private readonly outcomes: (RecoveryDatabaseOutcome | Error)[]) {}
  async evaluate(input: { apply: boolean; organizationId: string }) {
    this.calls.push({ apply: input.apply, organizationId: input.organizationId });
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

describe("identity recovery service", () => {
  it("verifies Cognito, preflights, and applies the relink", async () => {
    const cognito = new FakeCognito();
    const database = new FakeDatabase(["ready", "relinked"]);
    await expect(recoverStaffIdentity(configuration, {
      cognito,
      database,
      output: output().value,
      requestId: () => "request-1",
    })).resolves.toBe("relinked");
    expect(cognito.calls).toBe(1);
    expect(database.calls).toEqual([
      { apply: false, organizationId: configuration.organizationId },
      { apply: true, organizationId: configuration.organizationId },
    ]);
  });

  it.each([
    ["authorization_required", /active owner/i],
    ["target_not_found", /specified organization/i],
  ] as const)("denies %s without applying a change", async (outcome, message) => {
    const database = new FakeDatabase([outcome]);
    await expect(recoverStaffIdentity(configuration, {
      cognito: new FakeCognito(),
      database,
      output: output().value,
    })).rejects.toThrow(message);
    expect(database.calls).toHaveLength(1);
  });

  it("treats duplicate recovery as a safe no-op", async () => {
    const logs = output();
    const database = new FakeDatabase(["already_complete"]);
    await expect(recoverStaffIdentity(configuration, {
      cognito: new FakeCognito(),
      database,
      output: logs.value,
    })).resolves.toBe("already_complete");
    expect(database.calls).toHaveLength(1);
    expect(logs.messages.join(" ")).toContain("already complete");
  });

  it("validates dry-run configuration without contacting AWS", async () => {
    const cognito = new FakeCognito();
    const database = new FakeDatabase([]);
    await expect(recoverStaffIdentity(
      { ...configuration, mode: "dry-run" },
      { cognito, database, output: output().value },
    )).resolves.toBe("dry_run");
    expect(cognito.calls).toBe(0);
    expect(database.calls).toEqual([]);
  });

  it("preflights Cognito and Aurora without applying the relink", async () => {
    const cognito = new FakeCognito();
    const database = new FakeDatabase(["ready"]);
    await expect(recoverStaffIdentity(
      { ...configuration, mode: "preflight" },
      { cognito, database, output: output().value },
    )).resolves.toBe("ready");
    expect(cognito.calls).toBe(1);
    expect(database.calls).toEqual([
      { apply: false, organizationId: configuration.organizationId },
    ]);
  });

  it("keeps adapter failures secret-safe", async () => {
    const secret = "NeverPrintThisRecoverySecret";
    const cognito = new AwsRecoveryCognitoAdapter({
      async send() {
        throw new Error(secret);
      },
    });
    let error: RecoveryError | undefined;
    try {
      await recoverStaffIdentity(configuration, {
        cognito,
        database: new FakeDatabase([]),
        output: output().value,
      });
    } catch (caught) {
      error = caught as RecoveryError;
    }
    expect(error?.message).not.toContain(secret);
    expect(error?.message).not.toContain(configuration.adminSecretArn);
  });
});

describe("identity recovery input boundary", () => {
  const recoveryEnvironment = {
    AWS_REGION: configuration.region,
    COGNITO_USER_POOL_ID: configuration.userPoolId,
    DATABASE_CLUSTER_ARN: configuration.clusterArn,
    DATABASE_ADMIN_SECRET_ARN: configuration.adminSecretArn,
    DATABASE_NAME: configuration.database,
    RECOVERY_ORGANIZATION_ID: configuration.organizationId,
    RECOVERY_STAFF_EMAIL: configuration.staffEmail,
    RECOVERY_OLD_COGNITO_SUB: configuration.oldSubject,
    RECOVERY_NEW_COGNITO_SUB: configuration.newSubject,
    RECOVERY_AUTHORIZED_BY_SUB: configuration.authorizedBySubject,
    RECOVERY_AUTHORIZATION_REFERENCE: configuration.authorizationReference,
  };

  it("fails closed when required configuration is missing", () => {
    expect(() => parseRecoveryArguments(["--execute"], {})).toThrowError(RecoveryError);
  });

  it("uses the finalized database admin environment contract", () => {
    expect(parseRecoveryArguments(["--dry-run"], recoveryEnvironment)).toEqual({
      ...configuration,
      mode: "dry-run",
    });
    expect(() => parseRecoveryArguments(["--dry-run"], {
      ...recoveryEnvironment,
      DATABASE_ADMIN_SECRET_ARN: undefined,
      DATABASE_RUNTIME_SECRET_ARN: configuration.adminSecretArn,
    })).toThrow(/admin\/migration secret ARN is required/i);
  });

  it("requires an explicit execution mode", () => {
    expect(() => parseRecoveryArguments([], {})).toThrow(/exactly one/i);
    expect(() => parseRecoveryArguments(["--dry-run", "--execute"], {})).toThrow(/exactly one/i);
  });

  it("rejects role selection and identical subjects", async () => {
    expect(() => parseRecoveryArguments(["--role", "owner"], {})).toThrow(/Role selection/);
    await expect(recoverStaffIdentity(
      { ...configuration, newSubject: configuration.oldSubject },
      { cognito: new FakeCognito(), database: new FakeDatabase([]), output: output().value },
    )).rejects.toMatchObject({ code: "invalid_configuration" });
  });

  it("rejects the restricted application runtime secret", () => {
    expect(() => parseRecoveryArguments(["--dry-run"], {
      ...recoveryEnvironment,
      DATABASE_ADMIN_SECRET_ARN:
        "arn:aws:secretsmanager:us-west-2:111122223333:secret:perfect-shade-production/aurora/runtime-AbCdEf",
    })).toThrow(/runtime secret cannot perform identity recovery/i);
  });
});

describe("identity recovery AWS adapters", () => {
  it("accepts only an enabled, verified replacement with the explicit new subject", async () => {
    const commands: unknown[] = [];
    const adapter = new AwsRecoveryCognitoAdapter({
      async send(command: unknown) {
        commands.push(command);
        return {
          Enabled: true,
          UserStatus: "CONFIRMED",
          UserAttributes: [
            { Name: "sub", Value: configuration.newSubject },
            { Name: "email", Value: configuration.staffEmail },
            { Name: "email_verified", Value: "true" },
          ],
        };
      },
    });
    await expect(adapter.verifyReplacement({
      userPoolId: configuration.userPoolId,
      email: configuration.staffEmail,
      expectedSubject: configuration.newSubject,
    })).resolves.toBeUndefined();
    expect(commands[0]?.constructor?.name).toBe("AdminGetUserCommand");
  });

  it("rejects a mismatched Cognito subject without exposing it", async () => {
    const adapter = new AwsRecoveryCognitoAdapter({
      async send() {
        return {
          Enabled: true,
          UserStatus: "CONFIRMED",
          UserAttributes: [
            { Name: "sub", Value: "attacker-subject" },
            { Name: "email", Value: configuration.staffEmail },
            { Name: "email_verified", Value: "true" },
          ],
        };
      },
    });
    await expect(adapter.verifyReplacement({
      userPoolId: configuration.userPoolId,
      email: configuration.staffEmail,
      expectedSubject: configuration.newSubject,
    })).rejects.toMatchObject({ code: "cognito_identity_mismatch" });
  });

  it("rolls back the explicit Data API transaction on failure", async () => {
    const commands: unknown[] = [];
    const adapter = new AwsRecoveryDatabaseAdapter(configuration, {
      async send(command: unknown) {
        commands.push(command);
        if (command?.constructor?.name === "BeginTransactionCommand") {
          return { transactionId: "tx-1" };
        }
        if (command?.constructor?.name === "ExecuteStatementCommand") {
          throw new Error("database detail that must not escape");
        }
        return {};
      },
    });
    await expect(adapter.evaluate({
      organizationId: configuration.organizationId,
      staffEmail: configuration.staffEmail,
      oldSubject: configuration.oldSubject,
      newSubject: configuration.newSubject,
      authorizedBySubject: configuration.authorizedBySubject,
      authorizationReference: configuration.authorizationReference,
      requestId: "request-1",
      apply: true,
    })).rejects.toMatchObject({ code: "database_failed" });
    expect(commands.map((command) => command?.constructor?.name)).toEqual([
      "BeginTransactionCommand",
      "ExecuteStatementCommand",
      "RollbackTransactionCommand",
    ]);
  });
});

describe("identity recovery migration", () => {
  const sql = readFileSync(join(
    process.cwd(),
    "infra/database/migrations/0008_identity_recovery.sql",
  ), "utf8");

  it("enforces owner authorization, tenant boundaries, and an explicit subject transition", () => {
    expect(sql).toContain("owner_role is distinct from 'owner'");
    expect(sql).toContain("m.organization_id = expected_organization_id");
    expect(sql).toContain("old_cognito_subject = new_cognito_subject");
    expect(sql).toContain("authorized_owner_subject = old_cognito_subject");
    expect(sql).toContain("replacement_conflict");
  });

  it("preserves the role and status while creating a recovery audit event", () => {
    expect(sql).toContain("'identity.relinked'");
    expect(sql).toContain("'preservedRole', target_role");
    expect(sql).toContain("'preservedStatus', target_status");
    expect(sql).toContain("'oldCognitoSubject', old_cognito_subject");
    expect(sql).toContain("'newCognitoSubject', new_cognito_subject");
    expect(sql).toContain("updated_profile_count <> 1");
  });

  it("withholds the recovery function from the browser/runtime account", () => {
    expect(sql).toMatch(/revoke all on function[\s\S]+from public/);
    expect(sql).toMatch(/revoke all on function[\s\S]+from perfect_shade_app_runtime/);
  });
});
