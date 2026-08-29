import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadMigrationFiles } from "./migration-files.mjs";
import { migrationPlan } from "./runner.mjs";

describe("current Perfect Shade migration sequence", () => {
  it("accepts deployed history through 0007 and plans only identity recovery 0008", async () => {
    const migrations = await loadMigrationFiles(join(
      dirname(fileURLToPath(import.meta.url)),
      "..",
      "migrations",
    ));
    const applied = migrations.slice(0, 7).map((migration) => ({
      version: migration.version,
      filename: migration.filename,
      checksum: migration.checksum,
      appliedAt: "2026-08-29T00:00:00.000Z",
      durationMs: "1",
      runnerVersion: "test",
    }));
    const database = {
      async historyTableExists() {
        return true;
      },
      async loadHistory() {
        return applied;
      },
    };

    await expect(migrationPlan(database, migrations)).resolves.toMatchObject({
      pending: [{
        version: "0008",
        filename: "0008_identity_recovery.sql",
      }],
    });
  });
});
