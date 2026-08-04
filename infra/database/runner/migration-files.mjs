import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { TextDecoder } from "node:util";
import { MigrationRunnerError } from "./errors.mjs";
import {
  splitPostgresStatements,
  validateStatements,
} from "./sql-parser.mjs";

export const MIGRATION_FILENAME_PATTERN =
  /^(\d+)_([a-z0-9][a-z0-9_-]*)\.sql$/;

function compareFilenames(left, right) {
  return left.filename < right.filename
    ? -1
    : left.filename > right.filename
      ? 1
      : 0;
}

export async function loadMigrationFiles(directory) {
  let directoryStat;
  try {
    directoryStat = await stat(directory);
  } catch {
    throw new MigrationRunnerError(
      "INVALID_MIGRATION_DIRECTORY",
      "Migration directory does not exist.",
    );
  }
  if (!directoryStat.isDirectory()) {
    throw new MigrationRunnerError(
      "INVALID_MIGRATION_DIRECTORY",
      "Migration path is not a directory.",
    );
  }

  const entries = await readdir(directory, { withFileTypes: true });
  const sqlFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".sql"))
    .map((entry) => entry.name);
  const malformed = sqlFiles.filter(
    (filename) => !MIGRATION_FILENAME_PATTERN.test(filename),
  );
  if (malformed.length > 0) {
    throw new MigrationRunnerError(
      "MALFORMED_MIGRATION_FILENAME",
      `Malformed migration filename(s): ${malformed.sort().join(", ")}.`,
    );
  }

  const migrations = [];
  const normalizedVersions = new Map();
  for (const filename of sqlFiles.sort()) {
    const match = MIGRATION_FILENAME_PATTERN.exec(filename);
    const version = match[1];
    const normalizedVersion = BigInt(version).toString();
    const previous = normalizedVersions.get(normalizedVersion);
    if (previous) {
      throw new MigrationRunnerError(
        "DUPLICATE_MIGRATION_VERSION",
        `Migration version ${version} is duplicated by ${previous} and ${filename}.`,
      );
    }
    normalizedVersions.set(normalizedVersion, filename);

    const bytes = await readFile(path.join(directory, filename));
    let sql;
    try {
      sql = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      throw new MigrationRunnerError(
        "INVALID_MIGRATION_ENCODING",
        `Migration ${filename} is not valid UTF-8.`,
      );
    }
    const statements = splitPostgresStatements(sql);
    validateStatements(statements, filename);
    migrations.push({
      version,
      filename,
      checksum: createHash("sha256").update(bytes).digest("hex"),
      statements,
    });
  }
  return migrations.sort(compareFilenames);
}
