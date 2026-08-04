import path from "node:path";
import { fileURLToPath } from "node:url";
import { MigrationRunnerError } from "./errors.mjs";

const DEFAULT_MIGRATION_DIRECTORY = path.resolve(
  fileURLToPath(new URL("../migrations/", import.meta.url)),
);
const COMMANDS = new Set(["status", "plan", "apply"]);
const OPTION_NAMES = new Map([
  ["--region", "region"],
  ["--cluster-arn", "clusterArn"],
  ["--secret-arn", "secretArn"],
  ["--database", "databaseName"],
  ["--migrations-dir", "migrationDirectory"],
]);

function optionValue(args, index, option) {
  const value = args[index + 1];
  if (!value || value.startsWith("--")) {
    throw new MigrationRunnerError(
      "INVALID_ARGUMENT",
      `${option} requires a value.`,
    );
  }
  return value;
}

export function parseCliArguments(args) {
  const [command, ...rest] = args;
  if (!command || !COMMANDS.has(command)) {
    throw new MigrationRunnerError(
      "INVALID_COMMAND",
      "Command must be one of: status, plan, apply.",
    );
  }

  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const option = rest[index];
    const property = OPTION_NAMES.get(option);
    if (!property) {
      throw new MigrationRunnerError(
        "INVALID_ARGUMENT",
        `Unsupported option: ${option}`,
      );
    }
    options[property] = optionValue(rest, index, option);
    index += 1;
  }
  return { command, options };
}

export function loadRunnerConfig(options = {}, environment = process.env) {
  const config = {
    region:
      options.region ??
      environment.AWS_REGION ??
      environment.AWS_DEFAULT_REGION ??
      "",
    clusterArn: options.clusterArn ?? environment.AURORA_CLUSTER_ARN ?? "",
    secretArn: options.secretArn ?? environment.AURORA_SECRET_ARN ?? "",
    databaseName:
      options.databaseName ?? environment.AURORA_DATABASE_NAME ?? "",
    migrationDirectory: path.resolve(
      options.migrationDirectory ??
        environment.MIGRATION_DIRECTORY ??
        DEFAULT_MIGRATION_DIRECTORY,
    ),
    profile: environment.AWS_PROFILE?.trim() || undefined,
  };

  const missing = [];
  if (!config.region.trim()) missing.push("AWS region");
  if (!config.clusterArn.trim()) missing.push("Aurora cluster ARN");
  if (!config.secretArn.trim()) missing.push("Aurora secret ARN");
  if (!config.databaseName.trim()) missing.push("database name");
  if (missing.length > 0) {
    throw new MigrationRunnerError(
      "MISSING_CONFIGURATION",
      `Missing required configuration: ${missing.join(", ")}.`,
    );
  }
  if (!config.clusterArn.startsWith("arn:")) {
    throw new MigrationRunnerError(
      "INVALID_CONFIGURATION",
      "Aurora cluster ARN must be an ARN.",
    );
  }
  if (!config.secretArn.startsWith("arn:")) {
    throw new MigrationRunnerError(
      "INVALID_CONFIGURATION",
      "Aurora secret ARN must be an ARN.",
    );
  }
  if (!/^[A-Za-z][A-Za-z0-9_]{0,62}$/.test(config.databaseName)) {
    throw new MigrationRunnerError(
      "INVALID_CONFIGURATION",
      "Database name must begin with a letter and contain only letters, digits, or underscores.",
    );
  }
  return Object.freeze(config);
}

export { DEFAULT_MIGRATION_DIRECTORY };
