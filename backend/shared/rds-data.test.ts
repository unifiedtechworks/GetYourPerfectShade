import { describe, expect, it } from "vitest";
import { RdsDataDatabase } from "./rds-data";

class FakeClient {
  readonly commands: unknown[] = [];

  async send(command: unknown) {
    this.commands.push(command);
    const name = command?.constructor?.name;
    if (name === "BeginTransactionCommand") return { transactionId: "tx-1" };
    if (name === "ExecuteStatementCommand") {
      return {
        columnMetadata: [{ name: "actor_id" }, { name: "active" }],
        records: [[{ stringValue: "staff-sub" }, { booleanValue: true }]],
      };
    }
    return {};
  }
}

describe("RDS Data API adapter", () => {
  it("uses the constrained runtime login secret for every Data API command", async () => {
    const client = new FakeClient();
    const database = new RdsDataDatabase({
      resourceArn: "cluster-arn",
      runtimeSecretArn: "runtime-secret-arn",
      database: "perfectshade",
    }, client);

    const transactionId = await database.beginTransaction();
    expect(transactionId).toBe("tx-1");
    const beginCommand = client.commands[0] as { input: { secretArn: string } };
    expect(beginCommand.input.secretArn).toBe("runtime-secret-arn");

    const rows = await database.execute({
      transactionId,
      sql: "select actor_id, active from fixture",
    });
    expect(rows).toEqual([{ actor_id: "staff-sub", active: "true" }]);
    const statementCommand = client.commands[1] as {
      input: { secretArn: string; sql: string };
    };
    expect(statementCommand.input.secretArn).toBe("runtime-secret-arn");
    expect(statementCommand.input.sql).toBe(
      "select actor_id, active from fixture",
    );
    expect(client.commands).toHaveLength(2);
  });

  it("requires the explicit runtime-secret environment contract", () => {
    const previous = { ...process.env };
    try {
      process.env.DATABASE_CLUSTER_ARN = "cluster-arn";
      process.env.DATABASE_NAME = "perfectshade";
      process.env.DATABASE_SECRET_ARN = "admin-secret-arn";
      delete process.env.DATABASE_RUNTIME_SECRET_ARN;
      expect(() => new RdsDataDatabase()).toThrow(
        "Database configuration is unavailable.",
      );
    } finally {
      process.env = previous;
    }
  });
});
