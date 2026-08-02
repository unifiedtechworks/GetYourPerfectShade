import { describe, expect, it } from "vitest";
import { RdsDataDatabase } from "./rds-data";

class FakeClient {
  readonly commands: unknown[] = [];

  async send(command: unknown) {
    this.commands.push(command);
    const name = command?.constructor?.name;
    if (name === "BeginTransactionCommand") return { transactionId: "tx-1" };
    if (name === "ExecuteStatementCommand" && this.commands.length > 2) {
      return {
        columnMetadata: [{ name: "actor_id" }, { name: "active" }],
        records: [[{ stringValue: "staff-sub" }, { booleanValue: true }]],
      };
    }
    return {};
  }
}

describe("RDS Data API adapter", () => {
  it("assumes the constrained runtime role before application SQL", async () => {
    const client = new FakeClient();
    const database = new RdsDataDatabase({
      resourceArn: "cluster-arn",
      secretArn: "secret-arn",
      database: "perfectshade",
      runtimeRole: "perfect_shade_app_runtime",
    }, client);

    const transactionId = await database.beginTransaction();
    const roleCommand = client.commands[1] as { input: { sql: string } };
    expect(transactionId).toBe("tx-1");
    expect(roleCommand.input.sql).toBe(
      "set local role perfect_shade_app_runtime",
    );

    const rows = await database.execute({
      transactionId,
      sql: "select actor_id, active from fixture",
    });
    expect(rows).toEqual([{ actor_id: "staff-sub", active: "true" }]);
  });
});
