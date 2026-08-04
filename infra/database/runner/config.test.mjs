import { describe, expect, it } from "vitest";
import {
  DEFAULT_MIGRATION_DIRECTORY,
  loadRunnerConfig,
  parseCliArguments,
} from "./config.mjs";

const VALID_ENVIRONMENT = {
  AWS_REGION: "us-west-2",
  AURORA_CLUSTER_ARN:
    "arn:aws:rds:us-west-2:000000000000:cluster:placeholder",
  AURORA_SECRET_ARN:
    "arn:aws:secretsmanager:us-west-2:000000000000:secret:placeholder",
  AURORA_DATABASE_NAME: "perfectshade",
  AWS_PROFILE: "approved-placeholder-profile",
};

describe("migration runner configuration", () => {
  it("reports every missing required input without opening AWS", () => {
    expect(() => loadRunnerConfig({}, {})).toThrowError(
      /AWS region, Aurora cluster ARN, Aurora secret ARN, database name/,
    );
  });

  it("uses standard AWS environment and the default migration directory", () => {
    expect(loadRunnerConfig({}, VALID_ENVIRONMENT)).toMatchObject({
      region: "us-west-2",
      databaseName: "perfectshade",
      migrationDirectory: DEFAULT_MIGRATION_DIRECTORY,
      profile: "approved-placeholder-profile",
    });
  });

  it("accepts explicit non-secret CLI configuration overrides", () => {
    const parsed = parseCliArguments([
      "status",
      "--region",
      "us-west-2",
      "--cluster-arn",
      VALID_ENVIRONMENT.AURORA_CLUSTER_ARN,
      "--secret-arn",
      VALID_ENVIRONMENT.AURORA_SECRET_ARN,
      "--database",
      "perfectshade",
      "--migrations-dir",
      "custom/migrations",
    ]);
    expect(parsed.command).toBe("status");
    expect(loadRunnerConfig(parsed.options, {})).toMatchObject({
      region: "us-west-2",
      databaseName: "perfectshade",
    });
  });

  it("exposes no destructive command", () => {
    for (const command of ["reset", "repair", "force", "rollback", "drop-schema"]) {
      expect(() => parseCliArguments([command])).toThrow(
        "Command must be one of: status, plan, apply.",
      );
    }
  });
});
