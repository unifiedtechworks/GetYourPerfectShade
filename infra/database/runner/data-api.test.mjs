import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RollbackTransactionCommand,
} from "@aws-sdk/client-rds-data";
import { describe, expect, it, vi } from "vitest";
import { DataApiMigrationDatabase } from "./data-api.mjs";

const CONFIG = {
  region: "us-west-2",
  clusterArn: "arn:aws:rds:us-west-2:000000000000:cluster:placeholder",
  secretArn:
    "arn:aws:secretsmanager:us-west-2:000000000000:secret:placeholder",
  databaseName: "perfectshade",
};

describe("RDS Data API adapter", () => {
  it("performs a read-only history-table check", async () => {
    const client = {
      send: vi.fn(async (command) => {
        expect(command).toBeInstanceOf(ExecuteStatementCommand);
        expect(command.input.sql).toContain("information_schema.tables");
        expect(command.input.transactionId).toBeUndefined();
        return { formattedRecords: '[{"history_exists":false}]' };
      }),
    };
    const database = new DataApiMigrationDatabase(CONFIG, client);
    await expect(database.historyTableExists()).resolves.toBe(false);
    expect(client.send).toHaveBeenCalledOnce();
  });

  it("maps begin, statement, history record, commit, and rollback commands", async () => {
    const commands = [];
    const client = {
      send: vi.fn(async (command) => {
        commands.push(command);
        if (command instanceof BeginTransactionCommand) {
          return { transactionId: "transaction-1" };
        }
        return {};
      }),
    };
    const database = new DataApiMigrationDatabase(CONFIG, client);
    const transactionId = await database.beginTransaction();
    await database.executeMigrationStatement(
      "select 1;",
      transactionId,
      "0001_example.sql",
      1,
    );
    await database.recordMigration(
      {
        version: "0001",
        filename: "0001_example.sql",
        checksum: "a".repeat(64),
        durationMs: 12,
        runnerVersion: "1.0.0",
      },
      transactionId,
    );
    await database.commitTransaction(transactionId);
    await database.rollbackTransaction("transaction-2");

    expect(commands[0]).toBeInstanceOf(BeginTransactionCommand);
    expect(commands[1]).toBeInstanceOf(ExecuteStatementCommand);
    expect(commands[1].input.transactionId).toBe("transaction-1");
    expect(commands[2]).toBeInstanceOf(ExecuteStatementCommand);
    expect(commands[2].input.sql).toContain(
      "insert into public.perfect_shade_schema_migrations",
    );
    expect(commands[3]).toBeInstanceOf(CommitTransactionCommand);
    expect(commands[4]).toBeInstanceOf(RollbackTransactionCommand);
  });

  it("initializes immutable history inside a transaction", async () => {
    const commands = [];
    const client = {
      send: vi.fn(async (command) => {
        commands.push(command);
        if (command instanceof BeginTransactionCommand) {
          return { transactionId: "history-transaction" };
        }
        return {};
      }),
    };
    const database = new DataApiMigrationDatabase(CONFIG, client);
    await database.initializeHistory();

    const bootstrapSql = commands
      .filter((command) => command instanceof ExecuteStatementCommand)
      .map((command) => command.input.sql)
      .join("\n");
    expect(bootstrapSql).toContain("before update or delete");
    expect(bootstrapSql).toContain("before truncate");
    expect(commands.at(-1)).toBeInstanceOf(CommitTransactionCommand);
  });

  it("returns secret-safe Data API errors", async () => {
    const client = {
      send: vi.fn(async () => {
        const error = new Error(
          "failed for " + CONFIG.secretArn + " at https://private.example",
        );
        error.name = "BadRequestException";
        throw error;
      }),
    };
    const database = new DataApiMigrationDatabase(CONFIG, client);
    await expect(database.historyTableExists()).rejects.toMatchObject({
      code: "DATA_API_OPERATION_FAILED",
      message:
        "RDS Data API ExecuteStatement failed (BadRequestException). No credentials, ARNs, SQL text, or endpoints are included in this message.",
    });
  });
});
