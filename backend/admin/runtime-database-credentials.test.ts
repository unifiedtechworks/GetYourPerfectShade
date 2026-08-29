import { describe, expect, it, vi } from "vitest";
import { createRuntimeCredentialProvisioner } from "./runtime-database-credentials";

class FakeClient {
  readonly commands: unknown[] = [];
  constructor(
    private readonly response: (name: string, index: number) => unknown,
  ) {}

  async send(command: unknown): Promise<unknown> {
    this.commands.push(command);
    return this.response(command?.constructor?.name ?? "", this.commands.length);
  }
}

const configuration = {
  clusterArn: "cluster-arn",
  adminSecretArn: "admin-secret-arn",
  runtimeSecretArn: "runtime-secret-arn",
  databaseName: "perfectshade",
} as const;

describe("runtime database credential provisioner", () => {
  it("uses the runtime password only as a Data API parameter", async () => {
    const password = "safe-runtime-password-value";
    const secrets = new FakeClient(() => ({
      SecretString: JSON.stringify({
        username: "perfect_shade_app_runtime",
        password,
      }),
    }));
    const rds = new FakeClient((name) =>
      name === "BeginTransactionCommand" ? { transactionId: "tx-1" } : {},
    );
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      const result = await createRuntimeCredentialProvisioner({
        configuration,
        rdsClient: rds,
        secretsClient: secrets,
      })({ RequestType: "Create", RequestId: "request-1" });

      expect(result.PhysicalResourceId).toBe(
        "perfect-shade-runtime-database-credentials",
      );
      const serializedSql = rds.commands
        .map((command) => (command as { input?: { sql?: string } }).input?.sql ?? "")
        .join("\n");
      expect(serializedSql).not.toContain(password);
      expect(serializedSql).toContain("perfect_shade_app_runtime");
      const parameterCommand = rds.commands[1] as {
        input: { parameters: readonly { value: { stringValue: string } }[] };
      };
      expect(parameterCommand.input.parameters[0].value.stringValue).toBe(password);
      expect(rds.commands.map((command) => command?.constructor?.name)).toEqual([
        "BeginTransactionCommand",
        "ExecuteStatementCommand",
        "ExecuteStatementCommand",
        "CommitTransactionCommand",
      ]);
      expect(stdout.mock.calls.flat().join(" ")).not.toContain(password);
    } finally {
      stdout.mockRestore();
    }
  });

  it("rolls back and emits only a safe failure when provisioning fails", async () => {
    const secrets = new FakeClient(() => ({
      SecretString: JSON.stringify({
        username: "perfect_shade_app_runtime",
        password: "safe-runtime-password-value",
      }),
    }));
    const rds = new FakeClient((name, index) => {
      if (name === "BeginTransactionCommand") return { transactionId: "tx-1" };
      if (name === "ExecuteStatementCommand" && index === 3) {
        throw new Error("password=never-log-this SQL secret");
      }
      return {};
    });
    const writes: string[] = [];
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation((value) => {
      writes.push(String(value));
      return true;
    });
    try {
      await expect(createRuntimeCredentialProvisioner({
        configuration,
        rdsClient: rds,
        secretsClient: secrets,
      })({ RequestType: "Update", RequestId: "request-2" })).rejects.toThrow(
        "Runtime database credential provisioning failed.",
      );
      expect(rds.commands.at(-1)?.constructor?.name).toBe(
        "RollbackTransactionCommand",
      );
      expect(writes.join(" ")).toContain("runtime_database_provisioning_failed");
      expect(writes.join(" ")).not.toContain("never-log-this");
      expect(writes.join(" ")).not.toContain("SQL secret");
    } finally {
      stdout.mockRestore();
    }
  });

  it("does not connect to AWS or drop the database role during stack deletion", async () => {
    const rds = new FakeClient(() => ({}));
    const secrets = new FakeClient(() => ({}));
    const result = await createRuntimeCredentialProvisioner({
      configuration,
      rdsClient: rds,
      secretsClient: secrets,
    })({ RequestType: "Delete" });
    expect(result.PhysicalResourceId).toBe(
      "perfect-shade-runtime-database-credentials",
    );
    expect(rds.commands).toHaveLength(0);
    expect(secrets.commands).toHaveLength(0);
  });

  it("refuses secrets for any other database username", async () => {
    const secrets = new FakeClient(() => ({
      SecretString: JSON.stringify({
        username: "perfectshade_admin",
        password: "safe-runtime-password-value",
      }),
    }));
    const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    try {
      await expect(createRuntimeCredentialProvisioner({
        configuration,
        rdsClient: new FakeClient(() => ({})),
        secretsClient: secrets,
      })({ RequestType: "Create" })).rejects.toThrow(
        "Runtime database credential provisioning failed.",
      );
    } finally {
      stdout.mockRestore();
    }
  });
});
