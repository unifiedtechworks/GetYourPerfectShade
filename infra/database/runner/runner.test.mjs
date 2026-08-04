import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { InvalidMigrationStateError } from "./errors.mjs";
import {
  applyMigrations,
  migrationPlan,
  migrationStatus,
} from "./runner.mjs";

function migration(version, name, sql = `select ${Number(version)};`) {
  return {
    version,
    filename: `${version}_${name}.sql`,
    checksum: createHash("sha256").update(sql).digest("hex"),
    statements: [sql],
  };
}

function historyRecord(item, overrides = {}) {
  return {
    version: item.version,
    filename: item.filename,
    checksum: item.checksum,
    appliedAt: "2026-08-04T00:00:00.000Z",
    durationMs: "10",
    runnerVersion: "1.0.0",
    ...overrides,
  };
}

class MockDatabase {
  constructor({ historyExists = true, history = [] } = {}) {
    this.exists = historyExists;
    this.history = [...history];
    this.calls = [];
    this.staged = new Map();
    this.failFilename = null;
    this.rollbackFails = false;
    this.transaction = 0;
  }

  async historyTableExists() {
    this.calls.push("history-exists");
    return this.exists;
  }

  async loadHistory(transactionId) {
    this.calls.push(`load-history:${transactionId ?? "none"}`);
    return [...this.history];
  }

  async initializeHistory() {
    this.calls.push("initialize-history");
    this.exists = true;
  }

  async beginTransaction() {
    const id = `tx-${++this.transaction}`;
    this.calls.push(`begin:${id}`);
    return id;
  }

  async lockHistory(transactionId) {
    this.calls.push(`lock:${transactionId}`);
  }

  async executeMigrationStatement(
    _statement,
    transactionId,
    filename,
    statementNumber,
  ) {
    this.calls.push(`execute:${filename}:${statementNumber}:${transactionId}`);
    if (filename === this.failFilename) throw new Error("mock SQL failure");
  }

  async recordMigration(record, transactionId) {
    this.calls.push(`record:${record.filename}:${transactionId}`);
    this.staged.set(transactionId, {
      ...record,
      appliedAt: "2026-08-04T00:00:00.000Z",
      durationMs: String(record.durationMs),
    });
  }

  async commitTransaction(transactionId) {
    this.calls.push(`commit:${transactionId}`);
    const record = this.staged.get(transactionId);
    if (record) this.history.push(record);
    this.staged.delete(transactionId);
  }

  async rollbackTransaction(transactionId) {
    this.calls.push(`rollback:${transactionId}`);
    this.staged.delete(transactionId);
    if (this.rollbackFails) throw new Error("mock rollback failure");
  }
}

const MIGRATIONS = [
  migration("0001", "account"),
  migration("0002", "estimate"),
];

describe("status and plan", () => {
  it("treats an empty database as all pending without creating history", async () => {
    const database = new MockDatabase({ historyExists: false });
    const result = await migrationStatus(database, MIGRATIONS);
    expect(result.applied).toEqual([]);
    expect(result.pending).toEqual(MIGRATIONS);
    expect(database.calls).toEqual(["history-exists"]);
  });

  it("shows all migrations pending from an empty history table", async () => {
    const database = new MockDatabase();
    const result = await migrationPlan(database, MIGRATIONS);
    expect(result.pending).toEqual(MIGRATIONS);
  });

  it("shows partially applied history", async () => {
    const database = new MockDatabase({
      history: [historyRecord(MIGRATIONS[0])],
    });
    const result = await migrationStatus(database, MIGRATIONS);
    expect(result.applied).toEqual([MIGRATIONS[0]]);
    expect(result.pending).toEqual([MIGRATIONS[1]]);
  });

  it("shows a fully applied history", async () => {
    const database = new MockDatabase({
      history: MIGRATIONS.map((item) => historyRecord(item)),
    });
    const result = await migrationStatus(database, MIGRATIONS);
    expect(result.pending).toEqual([]);
  });

  it.each([
    ["status", migrationStatus],
    ["plan", migrationPlan],
  ])("%s is read-only", async (_name, operation) => {
    const database = new MockDatabase();
    await operation(database, MIGRATIONS);
    expect(
      database.calls.some((call) =>
        /^(initialize|begin|lock|execute|record|commit|rollback)/.test(call),
      ),
    ).toBe(false);
  });

  it("refuses a changed checksum", async () => {
    const database = new MockDatabase({
      history: [
        historyRecord(MIGRATIONS[0], { checksum: "0".repeat(64) }),
      ],
    });
    await expect(migrationStatus(database, MIGRATIONS)).rejects.toBeInstanceOf(
      InvalidMigrationStateError,
    );
  });

  it("refuses invalid history with an applied migration after a gap", async () => {
    const database = new MockDatabase({
      history: [historyRecord(MIGRATIONS[1])],
    });
    await expect(migrationPlan(database, MIGRATIONS)).rejects.toThrow(
      /appears after a pending migration/,
    );
  });

  it("refuses duplicate and malformed history records", async () => {
    const database = new MockDatabase({
      history: [
        historyRecord(MIGRATIONS[0]),
        historyRecord(MIGRATIONS[0], {
          filename: "malformed.sql",
        }),
      ],
    });
    await expect(migrationStatus(database, MIGRATIONS)).rejects.toThrow(
      /duplicate version 0001[\s\S]*malformed/,
    );
  });
});

describe("apply", () => {
  it("initializes history and applies pending migrations in order", async () => {
    const database = new MockDatabase({ historyExists: false });
    let time = 100;
    const result = await applyMigrations(database, MIGRATIONS, () => time++);
    expect(result.appliedNow).toEqual(MIGRATIONS);
    expect(
      database.calls.filter((call) => call.startsWith("execute:")),
    ).toEqual([
      "execute:0001_account.sql:1:tx-1",
      "execute:0002_estimate.sql:1:tx-2",
    ]);
    expect(database.history.map((record) => record.filename)).toEqual([
      "0001_account.sql",
      "0002_estimate.sql",
    ]);
  });

  it("applies only migrations after the recorded prefix", async () => {
    const database = new MockDatabase({
      history: [historyRecord(MIGRATIONS[0])],
    });
    const result = await applyMigrations(database, MIGRATIONS);
    expect(result.appliedNow).toEqual([MIGRATIONS[1]]);
  });

  it("is a safe no-write rerun when fully applied", async () => {
    const database = new MockDatabase({
      history: MIGRATIONS.map((item) => historyRecord(item)),
    });
    const result = await applyMigrations(database, MIGRATIONS);
    expect(result.appliedNow).toEqual([]);
    expect(database.calls.some((call) => call.startsWith("begin:"))).toBe(false);
  });

  it("stops, rolls back, and does not record a failed migration", async () => {
    const database = new MockDatabase();
    database.failFilename = MIGRATIONS[0].filename;
    await expect(applyMigrations(database, MIGRATIONS)).rejects.toMatchObject({
      code: "MIGRATION_APPLY_FAILED",
      rollbackConfirmed: true,
    });
    expect(database.calls).toContain("rollback:tx-1");
    expect(database.calls.some((call) => call.startsWith("record:"))).toBe(false);
    expect(database.history).toEqual([]);
    expect(
      database.calls.some((call) => call.includes(MIGRATIONS[1].filename)),
    ).toBe(false);
  });

  it("reports when rollback cannot be confirmed", async () => {
    const database = new MockDatabase();
    database.failFilename = MIGRATIONS[0].filename;
    database.rollbackFails = true;
    await expect(applyMigrations(database, MIGRATIONS)).rejects.toMatchObject({
      rollbackConfirmed: false,
    });
  });
});
