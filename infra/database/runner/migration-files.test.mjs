import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadMigrationFiles } from "./migration-files.mjs";

const temporaryDirectories = [];

async function temporaryMigrationDirectory() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "perfect-shade-migrations-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("migration file discovery", () => {
  it("rejects an invalid migration directory", async () => {
    await expect(
      loadMigrationFiles(path.join(os.tmpdir(), "missing-perfect-shade-directory")),
    ).rejects.toMatchObject({ code: "INVALID_MIGRATION_DIRECTORY" });

    const directory = await temporaryMigrationDirectory();
    const file = path.join(directory, "not-a-directory");
    await writeFile(file, "content");
    await expect(loadMigrationFiles(file)).rejects.toMatchObject({
      code: "INVALID_MIGRATION_DIRECTORY",
    });
  });

  it("rejects malformed SQL filenames", async () => {
    const directory = await temporaryMigrationDirectory();
    await writeFile(path.join(directory, "account.sql"), "select 1;", "utf8");
    await expect(loadMigrationFiles(directory)).rejects.toMatchObject({
      code: "MALFORMED_MIGRATION_FILENAME",
    });
  });

  it("rejects duplicate numeric versions regardless of zero padding", async () => {
    const directory = await temporaryMigrationDirectory();
    await writeFile(path.join(directory, "0001_first.sql"), "select 1;", "utf8");
    await writeFile(path.join(directory, "1_second.sql"), "select 2;", "utf8");
    await expect(loadMigrationFiles(directory)).rejects.toMatchObject({
      code: "DUPLICATE_MIGRATION_VERSION",
    });
  });

  it("orders filenames deterministically and checksums exact file bytes", async () => {
    const directory = await temporaryMigrationDirectory();
    await writeFile(path.join(directory, "0002_second.sql"), "select 2;\n", "utf8");
    await writeFile(path.join(directory, "0001_first.sql"), "select 1;\n", "utf8");
    const first = await loadMigrationFiles(directory);
    await writeFile(path.join(directory, "0001_first.sql"), "select 1;\r\n", "utf8");
    const changed = await loadMigrationFiles(directory);

    expect(first.map((migration) => migration.filename)).toEqual([
      "0001_first.sql",
      "0002_second.sql",
    ]);
    expect(changed[0].checksum).not.toBe(first[0].checksum);
  });

  it("permits an empty migration directory", async () => {
    const directory = await temporaryMigrationDirectory();
    await mkdir(path.join(directory, "notes"));
    await expect(loadMigrationFiles(directory)).resolves.toEqual([]);
  });
});
