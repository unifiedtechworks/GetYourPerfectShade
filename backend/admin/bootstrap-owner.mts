import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  AdminCreateUserCommand,
  AdminGetUserCommand,
  CognitoIdentityProviderClient,
} from "@aws-sdk/client-cognito-identity-provider";
import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
} from "@aws-sdk/client-rds-data";

export const HELP = `Perfect Shade initial owner bootstrap

Usage:
  pnpm bootstrap:owner -- [options]

Required options (or matching environment variables):
  --region <region>                 AWS_REGION
  --user-pool-id <id>               COGNITO_USER_POOL_ID
  --cluster-arn <arn>                DATABASE_CLUSTER_ARN
  --secret-arn <arn>                 DATABASE_SECRET_ARN
  --database <name>                  DATABASE_NAME
  --owner-email <email>              OWNER_EMAIL
  --organization-name <name>         ORGANIZATION_NAME

Credential and safety options:
  --profile <name>                   AWS_PROFILE (normal AWS credential resolution)
  --dry-run                          Validate input without contacting AWS
  --resume-existing-user             Continue after a documented Cognito-only partial failure
  --help                             Show this help

Cognito generates and delivers the temporary password. This command never accepts or prints it.
The only membership role created by this command is owner.`;

export type BootstrapConfiguration = Readonly<{
  region: string;
  userPoolId: string;
  clusterArn: string;
  secretArn: string;
  database: string;
  ownerEmail: string;
  organizationName: string;
  profile?: string;
  dryRun: boolean;
  resumeExistingUser: boolean;
}>;

export type BootstrapOutcome = "created" | "already_complete" | "dry_run";
export type DatabaseOutcome =
  | "created"
  | "already_complete"
  | "creation_required"
  | "existing_organization"
  | "existing_owner"
  | "existing_membership";

export type StaffUser = Readonly<{ sub: string; email: string }>;

export interface CognitoBootstrapPort {
  findUser(userPoolId: string, email: string): Promise<StaffUser | null>;
  createUser(userPoolId: string, email: string): Promise<StaffUser>;
}

export interface OwnerBootstrapDatabasePort {
  evaluate(input: Readonly<{
    ownerSubject: string | null;
    ownerEmail: string;
    organizationName: string;
    requestId: string;
    allowCreate: boolean;
  }>): Promise<DatabaseOutcome>;
}

export interface SafeOutput {
  info(message: string): void;
  error(message: string): void;
}

export class BootstrapError extends Error {
  readonly code: string;
  readonly exitCode: number;

  constructor(
    code: string,
    message: string,
    exitCode: number,
  ) {
    super(message);
    this.name = "BootstrapError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

const VALUE_FLAGS: ReadonlyMap<string, string> = new Map([
  ["--region", "region"],
  ["--user-pool-id", "userPoolId"],
  ["--cluster-arn", "clusterArn"],
  ["--secret-arn", "secretArn"],
  ["--database", "database"],
  ["--owner-email", "ownerEmail"],
  ["--organization-name", "organizationName"],
  ["--profile", "profile"],
] as const);

function required(value: string | undefined, label: string): string {
  const normalized = value?.trim();
  if (!normalized) {
    throw new BootstrapError("missing_configuration", `${label} is required.`, 2);
  }
  return normalized;
}

export function parseBootstrapArguments(
  argv: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
): BootstrapConfiguration | { help: true } {
  const values: Record<string, string | undefined> = {
    region: environment.AWS_REGION,
    userPoolId: environment.COGNITO_USER_POOL_ID,
    clusterArn: environment.DATABASE_CLUSTER_ARN,
    secretArn: environment.DATABASE_SECRET_ARN,
    database: environment.DATABASE_NAME,
    ownerEmail: environment.OWNER_EMAIL,
    organizationName: environment.ORGANIZATION_NAME,
    profile: environment.AWS_PROFILE,
  };
  let dryRun = false;
  let resumeExistingUser = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    if (argument === "--resume-existing-user") {
      resumeExistingUser = true;
      continue;
    }
    const target = VALUE_FLAGS.get(argument);
    if (!target) {
      throw new BootstrapError(
        "invalid_argument",
        `Unsupported option: ${argument}. Role selection is not permitted.`,
        2,
      );
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new BootstrapError("invalid_argument", `${argument} requires a value.`, 2);
    }
    values[target] = value;
    index += 1;
  }

  const configuration: BootstrapConfiguration = {
    region: required(values.region, "AWS region"),
    userPoolId: required(values.userPoolId, "Cognito User Pool ID"),
    clusterArn: required(values.clusterArn, "Aurora cluster ARN"),
    secretArn: required(values.secretArn, "Aurora secret ARN"),
    database: required(values.database, "Database name"),
    ownerEmail: required(values.ownerEmail, "Owner email").toLowerCase(),
    organizationName: required(values.organizationName, "Organization name"),
    profile: values.profile?.trim() || undefined,
    dryRun,
    resumeExistingUser,
  };
  validateConfiguration(configuration);
  return configuration;
}

export function validateConfiguration(configuration: BootstrapConfiguration) {
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(configuration.region)) {
    throw new BootstrapError("invalid_configuration", "AWS region is invalid.", 2);
  }
  if (!configuration.userPoolId.startsWith(`${configuration.region}_`)) {
    throw new BootstrapError(
      "invalid_configuration",
      "Cognito User Pool ID does not match the configured region.",
      2,
    );
  }
  if (!/^arn:[^:]+:rds:[^:]+:[0-9]{12}:cluster:[A-Za-z0-9-]+$/.test(configuration.clusterArn)) {
    throw new BootstrapError("invalid_configuration", "Aurora cluster ARN is invalid.", 2);
  }
  if (!/^arn:[^:]+:secretsmanager:[^:]+:[0-9]{12}:secret:[^\s]+$/.test(configuration.secretArn)) {
    throw new BootstrapError("invalid_configuration", "Aurora secret ARN is invalid.", 2);
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(configuration.database)) {
    throw new BootstrapError("invalid_configuration", "Database name is invalid.", 2);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuration.ownerEmail)) {
    throw new BootstrapError("invalid_configuration", "Owner email is invalid.", 2);
  }
  if (
    configuration.organizationName.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(configuration.organizationName)
  ) {
    throw new BootstrapError("invalid_configuration", "Organization name is invalid.", 2);
  }
  if (configuration.profile && /[\u0000-\u001f\u007f]/.test(configuration.profile)) {
    throw new BootstrapError("invalid_configuration", "AWS profile is invalid.", 2);
  }
}

function attribute(
  attributes: readonly { Name?: string; Value?: string }[] | undefined,
  name: string,
) {
  return attributes?.find((item) => item.Name === name)?.Value;
}

type AwsClient = Readonly<{ send(command: unknown): Promise<unknown> }>;

export class AwsCognitoBootstrapAdapter implements CognitoBootstrapPort {
  private readonly client: AwsClient;

  constructor(client: AwsClient) {
    this.client = client;
  }

  async findUser(userPoolId: string, email: string): Promise<StaffUser | null> {
    try {
      const response = await this.client.send(new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: email,
      })) as { UserAttributes?: readonly { Name?: string; Value?: string }[] };
      const sub = attribute(response.UserAttributes, "sub");
      const storedEmail = attribute(response.UserAttributes, "email")?.toLowerCase();
      const emailVerified = attribute(response.UserAttributes, "email_verified") === "true";
      if (!sub || storedEmail !== email.toLowerCase() || !emailVerified) {
        throw new BootstrapError(
          "cognito_identity_mismatch",
          "The existing Cognito identity does not safely match the requested owner.",
          3,
        );
      }
      return { sub, email: storedEmail };
    } catch (error) {
      if ((error as { name?: string }).name === "UserNotFoundException") return null;
      if (error instanceof BootstrapError) throw error;
      throw new BootstrapError(
        "cognito_lookup_failed",
        "Cognito user lookup failed. No database changes were attempted.",
        4,
      );
    }
  }

  async createUser(userPoolId: string, email: string): Promise<StaffUser> {
    try {
      const response = await this.client.send(new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        DesiredDeliveryMediums: ["EMAIL"],
        ForceAliasCreation: false,
        UserAttributes: [
          { Name: "email", Value: email },
          { Name: "email_verified", Value: "true" },
        ],
      })) as { User?: { Attributes?: readonly { Name?: string; Value?: string }[] } };
      const sub = attribute(response.User?.Attributes, "sub");
      if (!sub) {
        throw new Error("missing-sub");
      }
      return { sub, email };
    } catch {
      throw new BootstrapError(
        "cognito_create_failed",
        "Cognito staff-user creation failed. No database changes were attempted.",
        4,
      );
    }
  }
}

export class AwsOwnerBootstrapDatabaseAdapter implements OwnerBootstrapDatabasePort {
  private readonly configuration: Pick<
    BootstrapConfiguration,
    "clusterArn" | "secretArn" | "database"
  >;
  private readonly client: AwsClient;

  constructor(
    configuration: Pick<
      BootstrapConfiguration,
      "clusterArn" | "secretArn" | "database"
    >,
    client: AwsClient,
  ) {
    this.configuration = configuration;
    this.client = client;
  }

  async evaluate(input: Readonly<{
    ownerSubject: string | null;
    ownerEmail: string;
    organizationName: string;
    requestId: string;
    allowCreate: boolean;
  }>): Promise<DatabaseOutcome> {
    let transactionId: string | undefined;
    try {
      const begun = await this.client.send(new BeginTransactionCommand({
        resourceArn: this.configuration.clusterArn,
        secretArn: this.configuration.secretArn,
        database: this.configuration.database,
      })) as { transactionId?: string };
      transactionId = begun.transactionId;
      if (!transactionId) throw new Error("transaction-not-started");

      const response = await this.client.send(new ExecuteStatementCommand({
        resourceArn: this.configuration.clusterArn,
        secretArn: this.configuration.secretArn,
        database: this.configuration.database,
        transactionId,
        formatRecordsAs: "JSON",
        sql: `select outcome, organization_id::text
          from app_private.bootstrap_initial_owner(
            :owner_subject,
            :owner_email,
            :organization_name,
            :request_id,
            :allow_create
          )`,
        parameters: [
          {
            name: "owner_subject",
            value: input.ownerSubject
              ? { stringValue: input.ownerSubject }
              : { isNull: true },
          },
          { name: "owner_email", value: { stringValue: input.ownerEmail } },
          { name: "organization_name", value: { stringValue: input.organizationName } },
          { name: "request_id", value: { stringValue: input.requestId } },
          { name: "allow_create", value: { booleanValue: input.allowCreate } },
        ],
      })) as { formattedRecords?: string };
      const records = JSON.parse(response.formattedRecords ?? "[]") as unknown;
      const outcome = Array.isArray(records) && records.length > 0
        ? (records[0] as { outcome?: unknown }).outcome
        : undefined;
      if (
        outcome !== "created" && outcome !== "already_complete" &&
        outcome !== "creation_required" && outcome !== "existing_organization" &&
        outcome !== "existing_owner" && outcome !== "existing_membership"
      ) {
        throw new Error("unexpected-bootstrap-outcome");
      }

      await this.client.send(new CommitTransactionCommand({
        resourceArn: this.configuration.clusterArn,
        secretArn: this.configuration.secretArn,
        transactionId,
      }));
      transactionId = undefined;
      return outcome;
    } catch {
      if (transactionId) {
        try {
          await this.client.send(new RollbackTransactionCommand({
            resourceArn: this.configuration.clusterArn,
            secretArn: this.configuration.secretArn,
            transactionId,
          }));
        } catch {
          // Preserve the original failure; the Data API also expires abandoned transactions.
        }
      }
      throw new BootstrapError(
        "database_failed",
        "Aurora owner bootstrap failed and the database transaction was rolled back.",
        4,
      );
    }
  }
}

function duplicateMessage(outcome: Exclude<DatabaseOutcome, "created" | "creation_required">) {
  switch (outcome) {
    case "already_complete":
      return "Initial owner bootstrap is already complete; no changes were made.";
    case "existing_owner":
      return "The organization already has an active owner; no changes were made.";
    case "existing_organization":
      return "The organization already exists without this completed bootstrap; no changes were made.";
    case "existing_membership":
      return "The Cognito subject already has account data or an active membership; no changes were made.";
  }
}

export async function bootstrapInitialOwner(
  configuration: BootstrapConfiguration,
  dependencies: Readonly<{
    cognito: CognitoBootstrapPort;
    database: OwnerBootstrapDatabasePort;
    output: SafeOutput;
    requestId?: () => string;
  }>,
): Promise<BootstrapOutcome> {
  validateConfiguration(configuration);
  if (configuration.dryRun) {
    dependencies.output.info(
      "Dry run complete: configuration is valid; no AWS calls or database changes were made.",
    );
    return "dry_run";
  }

  const requestId = dependencies.requestId?.() ?? randomUUID();
  let user = await dependencies.cognito.findUser(
    configuration.userPoolId,
    configuration.ownerEmail,
  );

  const preflight = await dependencies.database.evaluate({
    ownerSubject: user?.sub ?? null,
    ownerEmail: configuration.ownerEmail,
    organizationName: configuration.organizationName,
    requestId,
    allowCreate: false,
  });
  if (preflight === "already_complete") {
    dependencies.output.info(duplicateMessage(preflight));
    return "already_complete";
  }
  if (preflight === "created") {
    throw new BootstrapError(
      "database_protocol_error",
      "Aurora returned an invalid mutating result during preflight; no Cognito user was created.",
      4,
    );
  }
  if (preflight !== "creation_required") {
    throw new BootstrapError("duplicate_database_state", duplicateMessage(preflight), 3);
  }
  if (user && !configuration.resumeExistingUser) {
    throw new BootstrapError(
      "existing_cognito_user",
      "The Cognito user already exists but owner bootstrap is incomplete. Review the recovery procedure, then rerun with --resume-existing-user.",
      3,
    );
  }

  let cognitoCreated = false;
  if (!user) {
    user = await dependencies.cognito.createUser(
      configuration.userPoolId,
      configuration.ownerEmail,
    );
    cognitoCreated = true;
  }

  let result: DatabaseOutcome;
  try {
    result = await dependencies.database.evaluate({
      ownerSubject: user.sub,
      ownerEmail: configuration.ownerEmail,
      organizationName: configuration.organizationName,
      requestId,
      allowCreate: true,
    });
  } catch {
    if (cognitoCreated) {
      throw new BootstrapError(
        "partial_external_failure",
        "Cognito created the staff user, but Aurora bootstrap failed. Do not create another user. Resolve the database issue and rerun with --resume-existing-user.",
        4,
      );
    }
    throw new BootstrapError(
      "database_failed",
      "Aurora owner bootstrap failed and no Cognito user was created by this invocation.",
      4,
    );
  }

  if (result === "created") {
    dependencies.output.info(
      "Initial owner bootstrap completed. Cognito will require the staff user to set a permanent password at first sign-in.",
    );
    return "created";
  }
  if (result === "already_complete") {
    dependencies.output.info(duplicateMessage(result));
    return "already_complete";
  }
  if (result === "creation_required") {
    throw new BootstrapError(
      "database_protocol_error",
      "Aurora did not complete the requested owner bootstrap.",
      4,
    );
  }
  throw new BootstrapError(
    cognitoCreated ? "partial_external_failure" : "duplicate_database_state",
    cognitoCreated
      ? "Cognito created the staff user, but Aurora rejected the bootstrap as a duplicate. Do not create another user; follow the recovery procedure."
      : duplicateMessage(result),
    cognitoCreated ? 4 : 3,
  );
}

export async function runCli(
  argv: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
  output: SafeOutput = console,
) {
  try {
    const parsed = parseBootstrapArguments(argv, environment);
    if ("help" in parsed) {
      output.info(HELP);
      return 0;
    }
    if (parsed.profile) process.env.AWS_PROFILE = parsed.profile;
    const cognito = new AwsCognitoBootstrapAdapter(
      new CognitoIdentityProviderClient({ region: parsed.region }) as AwsClient,
    );
    const database = new AwsOwnerBootstrapDatabaseAdapter(
      parsed,
      new RDSDataClient({ region: parsed.region }) as AwsClient,
    );
    await bootstrapInitialOwner(parsed, { cognito, database, output });
    return 0;
  } catch (error) {
    if (error instanceof BootstrapError) {
      output.error(`Owner bootstrap stopped: ${error.message}`);
      return error.exitCode;
    }
    output.error("Owner bootstrap stopped because of an unexpected non-sensitive error.");
    return 4;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
