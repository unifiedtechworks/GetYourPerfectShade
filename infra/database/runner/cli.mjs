#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { parseCliArguments, loadRunnerConfig } from "./config.mjs";
import { DataApiMigrationDatabase } from "./data-api.mjs";
import { MigrationRunnerError } from "./errors.mjs";
import { loadMigrationFiles } from "./migration-files.mjs";
import {
  applyMigrations,
  migrationPlan,
  migrationStatus,
} from "./runner.mjs";

function printList(title, migrations, marker) {
  console.log(`${title} (${migrations.length})`);
  if (migrations.length === 0) console.log("  none");
  for (const migration of migrations) {
    console.log(`  ${marker} ${migration.filename}  ${migration.checksum}`);
  }
}

export async function runCli(
  args,
  environment = process.env,
  dependencies = {},
) {
  const { command, options } = parseCliArguments(args);
  const config = loadRunnerConfig(options, environment);
  const migrations = await (
    dependencies.loadMigrations ?? loadMigrationFiles
  )(config.migrationDirectory);
  const database =
    dependencies.database ?? new DataApiMigrationDatabase(config);

  if (command === "status") {
    const result = await migrationStatus(database, migrations);
    printList("Applied migrations", result.applied, "applied");
    printList("Pending migrations", result.pending, "pending");
    return 0;
  }
  if (command === "plan") {
    const result = await migrationPlan(database, migrations);
    printList("Migrations to apply", result.pending, "apply");
    return 0;
  }

  const result = await applyMigrations(database, migrations);
  printList("Applied in this run", result.appliedNow, "applied");
  printList("Remaining migrations", result.pending, "pending");
  return 0;
}

function safeErrorMessage(error) {
  if (error instanceof MigrationRunnerError) return error.message;
  return "Migration runner failed unexpectedly. Inspect controlled AWS diagnostics; no sensitive details were printed.";
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  runCli(process.argv.slice(2))
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      console.error(safeErrorMessage(error));
      process.exitCode = 1;
    });
}
