import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  legacyRuntimeRoleBootstrapSatisfied,
  LEGACY_RUNTIME_ROLE_BOOTSTRAP,
  LEGACY_RUNTIME_ROLE_SATISFIED_MESSAGE,
} from "./compatibility.mjs";
import { RUNNER_VERSION } from "./history.mjs";
import { loadMigrationFiles } from "./migration-files.mjs";
import { applyMigrations, migrationPlan, migrationStatus } from "./runner.mjs";

const migrations = await loadMigrationFiles(join(
  dirname(fileURLToPath(import.meta.url)), "..", "migrations",
));
const foundation = migrations[0];
const safeRole = {
  rolcanlogin: true,
  rolinherit: false,
  rolsuper: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolreplication: false,
  rolbypassrls: false,
};

class CompatibilityDatabase {
  constructor(role = safeRole) {
    this.role = role;
    this.history = [];
    this.calls = [];
    this.executed = [];
    this.staged = null;
    this.schemaStatements = [];
    this.failAt = null;
  }
  async historyTableExists() { return true; }
  async loadHistory() { return [...this.history]; }
  async beginTransaction() { this.calls.push("begin"); return "migration-tx"; }
  async lockHistory() { this.calls.push("lock"); }
  async inspectRuntimeRole(transactionId) {
    this.calls.push("inspect-role");
    expect(transactionId).toBe("migration-tx");
    return this.role;
  }
  async executeMigrationStatement(statement, transactionId, filename, number) {
    this.calls.push(`execute:${number}`);
    this.executed.push({ statement, transactionId, filename, number });
    if (number === this.failAt) {
      const error = new Error("permission denied to alter role; private diagnostic");
      error.code = "42501";
      throw error;
    }
    this.schemaStatements.push(statement);
  }
  async recordMigration(record, transactionId) {
    this.calls.push("record");
    expect(transactionId).toBe("migration-tx");
    this.staged = { ...record, appliedAt: "2026-10-08T00:00:00.000Z" };
  }
  async commitTransaction() {
    this.calls.push("commit");
    if (this.staged) this.history.push(this.staged);
    this.staged = null;
  }
  async rollbackTransaction() {
    this.calls.push("rollback");
    this.staged = null;
    this.schemaStatements = [];
  }
}

function compatibilityInput(database, overrides = {}) {
  return {
    database, migration: foundation, statement: foundation.statements[3],
    statementNumber: 4, transactionId: "migration-tx", ...overrides,
  };
}

describe("legacy 0001 runtime-role compatibility", () => {
  it("pins the immutable file and exact parsed fourth statement", () => {
    expect(foundation.filename).toBe(LEGACY_RUNTIME_ROLE_BOOTSTRAP.filename);
    expect(foundation.checksum).toBe(
      "efebbb1ad193d5a110e152a99565867504f88aa313413226237a957ce4e7d7e3",
    );
    expect(createHash("sha256").update(foundation.statements[3], "utf8")
      .digest("hex")).toBe(LEGACY_RUNTIME_ROLE_BOOTSTRAP.statementChecksum);
  });

  it("skips only the satisfied legacy block and records the original checksum after all schema work", async () => {
    const database = new CompatibilityDatabase();
    const report = vi.fn();
    const result = await applyMigrations(database, [foundation], undefined, report);
    expect(result.appliedNow).toEqual([foundation]);
    expect(database.executed.map(({ number }) => number)).toEqual(
      foundation.statements.map((_, i) => i + 1).filter((n) => n !== 4),
    );
    expect(database.executed.every(({ transactionId }) => transactionId === "migration-tx"))
      .toBe(true);
    expect(database.calls.indexOf("lock")).toBeLessThan(database.calls.indexOf("inspect-role"));
    expect(database.calls.indexOf("inspect-role")).toBeLessThan(database.calls.indexOf("execute:5"));
    expect(database.calls.slice(-2)).toEqual(["record", "commit"]);
    expect(database.history[0]).toMatchObject({
      filename: foundation.filename, checksum: foundation.checksum,
      runnerVersion: RUNNER_VERSION,
    });
    expect(report).toHaveBeenCalledExactlyOnceWith(LEGACY_RUNTIME_ROLE_SATISFIED_MESSAGE);
  });

  it("fails closed when the provisioner has not created the role", async () => {
    const database = new CompatibilityDatabase(null);
    const report = vi.fn();
    await expect(applyMigrations(database, [foundation], undefined, report))
      .rejects.toMatchObject({
        rollbackConfirmed: true, statementNumber: 4,
        message: expect.stringContaining("provisioner must succeed"),
        cause: { code: "PROVISIONED_RUNTIME_ROLE_MISSING" },
      });
    expect(database.calls).toContain("rollback");
    expect(database.calls).not.toContain("record");
    expect(database.executed.some(({ number }) => number === 4)).toBe(false);
    expect(database.history).toEqual([]);
    expect(database.schemaStatements).toEqual([]);
    expect(report).not.toHaveBeenCalled();
  });

  it.each([
    ["rolbypassrls", true], ["rolsuper", true], ["rolcreaterole", true],
    ["rolcreatedb", true], ["rolinherit", true], ["rolcanlogin", false],
    ["rolreplication", true], ["rolbypassrls", undefined], ["rolcanlogin", "true"],
  ])("fails closed for an unsafe or malformed %s=%s attribute", async (attribute, value) => {
    const database = new CompatibilityDatabase({ ...safeRole, [attribute]: value });
    await expect(applyMigrations(database, [foundation]))
      .rejects.toMatchObject({
        rollbackConfirmed: true, statementNumber: 4,
        message: expect.stringContaining(attribute),
        cause: { code: "PROVISIONED_RUNTIME_ROLE_ATTRIBUTES_INVALID" },
      });
    expect(database.executed.some(({ number }) => number === 4)).toBe(false);
    expect(database.history).toEqual([]);
    expect(database.schemaStatements).toEqual([]);
    expect(database.calls).not.toContain("record");
  });

  it("does not skip the same SQL in a different migration", async () => {
    const database = new CompatibilityDatabase();
    const other = { ...foundation, filename: "0001_other.sql" };
    await applyMigrations(database, [other]);
    expect(database.calls).not.toContain("inspect-role");
    expect(database.executed.find(({ number }) => number === 4)?.statement)
      .toBe(foundation.statements[3]);
  });

  it("does not skip the same SQL at a different statement number", async () => {
    const database = new CompatibilityDatabase();
    await expect(legacyRuntimeRoleBootstrapSatisfied(compatibilityInput(database, {
      statementNumber: 5,
    }))).resolves.toBe(false);
    expect(database.calls).not.toContain("inspect-role");
  });

  it.each(["migration", "statement", "version"])("refuses a changed %s fingerprint", async (kind) => {
    const database = new CompatibilityDatabase();
    const changed = { ...foundation, statements: [...foundation.statements] };
    if (kind === "migration") changed.checksum = "0".repeat(64);
    if (kind === "statement") changed.statements[3] += "\n-- modified";
    if (kind === "version") changed.version = "1";
    await expect(applyMigrations(database, [changed])).rejects.toMatchObject({
      rollbackConfirmed: true,
      cause: { code: "LEGACY_RUNTIME_ROLE_FINGERPRINT_MISMATCH" },
    });
    expect(database.calls).not.toContain("inspect-role");
    expect(database.calls).not.toContain("record");
    expect(database.history).toEqual([]);
  });

  it("rolls back later schema failures without marking the satisfied migration applied", async () => {
    const database = new CompatibilityDatabase();
    database.failAt = 5;
    await expect(applyMigrations(database, [foundation], undefined, vi.fn()))
      .rejects.toMatchObject({ statementNumber: 5, rollbackConfirmed: true });
    expect(database.history).toEqual([]);
    expect(database.schemaStatements).toEqual([]);
    expect(database.calls).not.toContain("record");
  });

  it("never catches a generic ALTER ROLE 42501 error elsewhere", async () => {
    const database = new CompatibilityDatabase();
    const sql = "alter role other_role nobypassrls;";
    const other = { version: "0002", filename: "0002_other.sql",
      checksum: createHash("sha256").update(sql).digest("hex"), statements: [sql] };
    database.failAt = 1;
    await expect(applyMigrations(database, [other])).rejects.toMatchObject({
      code: "MIGRATION_APPLY_FAILED", rollbackConfirmed: true,
      cause: { code: "42501" },
      message: expect.not.stringContaining("private diagnostic"),
    });
    expect(database.calls).not.toContain("inspect-role");
    expect(database.history).toEqual([]);
  });

  it("accepts original development history through 0009 without replay or role inspection", async () => {
    const database = new CompatibilityDatabase(null);
    database.history = migrations.map((migration) => ({
      version: migration.version, filename: migration.filename,
      checksum: migration.checksum, appliedAt: "2026-09-08T00:00:00.000Z",
      runnerVersion: "1.0.0",
    }));
    await expect(migrationStatus(database, migrations)).resolves.toMatchObject({ pending: [] });
    await expect(migrationPlan(database, migrations)).resolves.toMatchObject({ pending: [] });
    await expect(applyMigrations(database, migrations)).resolves.toMatchObject({ appliedNow: [] });
    expect(database.calls).toEqual([]);
    expect(database.history[0].checksum).toBe(LEGACY_RUNTIME_ROLE_BOOTSTRAP.migrationChecksum);
  });

  it("does not inspect or replay when another runner applied 0001 before the history lock", async () => {
    const database = new CompatibilityDatabase(null);
    database.lockHistory = async () => {
      database.history = [{ version: foundation.version, filename: foundation.filename,
        checksum: foundation.checksum, appliedAt: "2026-10-08T00:00:00.000Z" }];
    };
    await expect(applyMigrations(database, [foundation])).resolves.toMatchObject({ appliedNow: [] });
    expect(database.calls).not.toContain("inspect-role");
    expect(database.executed).toEqual([]);
  });
});
