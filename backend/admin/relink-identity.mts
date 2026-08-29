import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
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

export const HELP = `Perfect Shade staff identity recovery

Usage:
  pnpm recover:identity -- --dry-run [options]
  pnpm recover:identity -- --preflight [options]
  pnpm recover:identity -- --execute [options]

Required options (or matching environment variables):
  --region <region>                    AWS_REGION
  --user-pool-id <id>                  COGNITO_USER_POOL_ID
  --cluster-arn <arn>                   DATABASE_CLUSTER_ARN
  --admin-secret-arn <arn>              DATABASE_ADMIN_SECRET_ARN
  --database <name>                     DATABASE_NAME
  --organization-id <uuid>              RECOVERY_ORGANIZATION_ID
  --staff-email <email>                 RECOVERY_STAFF_EMAIL
  --old-subject <sub>                   RECOVERY_OLD_COGNITO_SUB
  --new-subject <sub>                   RECOVERY_NEW_COGNITO_SUB
  --authorized-by-subject <sub>         RECOVERY_AUTHORIZED_BY_SUB
  --authorization-reference <reference> RECOVERY_AUTHORIZATION_REFERENCE

Credential and safety options:
  --profile <name>                      AWS_PROFILE (normal AWS credential resolution)
  --dry-run                             Validate configuration only; make no AWS calls
  --preflight                           Verify Cognito and Aurora without changing data
  --execute                             Verify Cognito, preflight Aurora, then relink
  --help                                Show this help

This command cannot create or delete Cognito users, change roles, or cross organizations.
Do not place credentials or sensitive personal data in the authorization reference.`;

export type RecoveryConfiguration = Readonly<{
  region: string;
  userPoolId: string;
  clusterArn: string;
  adminSecretArn: string;
  database: string;
  organizationId: string;
  staffEmail: string;
  oldSubject: string;
  newSubject: string;
  authorizedBySubject: string;
  authorizationReference: string;
  profile?: string;
  mode: "dry-run" | "preflight" | "execute";
}>;

export type RecoveryDatabaseOutcome =
  | "ready"
  | "relinked"
  | "already_complete"
  | "authorization_required"
  | "target_not_found"
  | "identity_mismatch"
  | "replacement_conflict"
  | "invalid_recovery_request";

export interface RecoveryCognitoPort {
  verifyReplacement(input: Readonly<{
    userPoolId: string;
    email: string;
    expectedSubject: string;
  }>): Promise<void>;
}

export interface RecoveryDatabasePort {
  evaluate(input: Readonly<{
    organizationId: string;
    staffEmail: string;
    oldSubject: string;
    newSubject: string;
    authorizedBySubject: string;
    authorizationReference: string;
    requestId: string;
    apply: boolean;
  }>): Promise<RecoveryDatabaseOutcome>;
}

export interface SafeOutput {
  info(message: string): void;
  error(message: string): void;
}

export class RecoveryError extends Error {
  readonly code: string;
  readonly exitCode: number;

  constructor(
    code: string,
    message: string,
    exitCode: number,
  ) {
    super(message);
    this.name = "RecoveryError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

const VALUE_FLAGS = new Map<string, keyof Omit<RecoveryConfiguration, "mode">>([
  ["--region", "region"],
  ["--user-pool-id", "userPoolId"],
  ["--cluster-arn", "clusterArn"],
  ["--admin-secret-arn", "adminSecretArn"],
  ["--database", "database"],
  ["--organization-id", "organizationId"],
  ["--staff-email", "staffEmail"],
  ["--old-subject", "oldSubject"],
  ["--new-subject", "newSubject"],
  ["--authorized-by-subject", "authorizedBySubject"],
  ["--authorization-reference", "authorizationReference"],
  ["--profile", "profile"],
]);

function requireValue(value: string | undefined, label: string) {
  const normalized = value?.trim();
  if (!normalized) throw new RecoveryError("missing_configuration", `${label} is required.`, 2);
  return normalized;
}

export function parseRecoveryArguments(
  argv: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
): RecoveryConfiguration | { help: true } {
  const values: Partial<Record<keyof Omit<RecoveryConfiguration, "mode">, string>> = {
    region: environment.AWS_REGION,
    userPoolId: environment.COGNITO_USER_POOL_ID,
    clusterArn: environment.DATABASE_CLUSTER_ARN,
    adminSecretArn: environment.DATABASE_ADMIN_SECRET_ARN,
    database: environment.DATABASE_NAME,
    organizationId: environment.RECOVERY_ORGANIZATION_ID,
    staffEmail: environment.RECOVERY_STAFF_EMAIL,
    oldSubject: environment.RECOVERY_OLD_COGNITO_SUB,
    newSubject: environment.RECOVERY_NEW_COGNITO_SUB,
    authorizedBySubject: environment.RECOVERY_AUTHORIZED_BY_SUB,
    authorizationReference: environment.RECOVERY_AUTHORIZATION_REFERENCE,
    profile: environment.AWS_PROFILE,
  };
  let mode: RecoveryConfiguration["mode"] | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--help" || argument === "-h") return { help: true };
    if (["--dry-run", "--preflight", "--execute"].includes(argument)) {
      const requested = argument.slice(2) as RecoveryConfiguration["mode"];
      if (mode && mode !== requested) {
        throw new RecoveryError("invalid_argument", "Choose exactly one recovery execution mode.", 2);
      }
      mode = requested;
      continue;
    }
    const target = VALUE_FLAGS.get(argument);
    if (!target) {
      throw new RecoveryError(
        "invalid_argument",
        `Unsupported option: ${argument}. Role selection is not permitted.`,
        2,
      );
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new RecoveryError("invalid_argument", `${argument} requires a value.`, 2);
    }
    values[target] = value;
    index += 1;
  }

  if (!mode) {
    throw new RecoveryError("missing_mode", "Choose exactly one of --dry-run, --preflight, or --execute.", 2);
  }
  const configuration: RecoveryConfiguration = {
    region: requireValue(values.region, "AWS region"),
    userPoolId: requireValue(values.userPoolId, "Cognito User Pool ID"),
    clusterArn: requireValue(values.clusterArn, "Aurora cluster ARN"),
    adminSecretArn: requireValue(values.adminSecretArn, "Aurora admin/migration secret ARN"),
    database: requireValue(values.database, "Database name"),
    organizationId: requireValue(values.organizationId, "Organization ID"),
    staffEmail: requireValue(values.staffEmail, "Staff email").toLowerCase(),
    oldSubject: requireValue(values.oldSubject, "Old Cognito subject"),
    newSubject: requireValue(values.newSubject, "New Cognito subject"),
    authorizedBySubject: requireValue(values.authorizedBySubject, "Authorizing owner subject"),
    authorizationReference: requireValue(values.authorizationReference, "Authorization reference"),
    profile: values.profile?.trim() || undefined,
    mode,
  };
  validateRecoveryConfiguration(configuration);
  return configuration;
}

export function validateRecoveryConfiguration(configuration: RecoveryConfiguration) {
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(configuration.region)) {
    throw new RecoveryError("invalid_configuration", "AWS region is invalid.", 2);
  }
  if (!configuration.userPoolId.startsWith(`${configuration.region}_`)) {
    throw new RecoveryError("invalid_configuration", "Cognito User Pool ID does not match the region.", 2);
  }
  if (!/^arn:[^:]+:rds:[^:]+:[0-9]{12}:cluster:[A-Za-z0-9-]+$/.test(configuration.clusterArn)) {
    throw new RecoveryError("invalid_configuration", "Aurora cluster ARN is invalid.", 2);
  }
  if (!/^arn:[^:]+:secretsmanager:[^:]+:[0-9]{12}:secret:[^\s]+$/.test(configuration.adminSecretArn)) {
    throw new RecoveryError("invalid_configuration", "Aurora admin/migration secret ARN is invalid.", 2);
  }
  if (/\/aurora\/runtime(?:-|$)/i.test(configuration.adminSecretArn)) {
    throw new RecoveryError(
      "invalid_configuration",
      "The restricted application runtime secret cannot perform identity recovery.",
      2,
    );
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(configuration.database)) {
    throw new RecoveryError("invalid_configuration", "Database name is invalid.", 2);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(configuration.organizationId)) {
    throw new RecoveryError("invalid_configuration", "Organization ID must be a UUID.", 2);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuration.staffEmail)) {
    throw new RecoveryError("invalid_configuration", "Staff email is invalid.", 2);
  }
  for (const subject of [configuration.oldSubject, configuration.newSubject, configuration.authorizedBySubject]) {
    if (subject.length > 200 || /[\u0000-\u001f\u007f]/.test(subject)) {
      throw new RecoveryError("invalid_configuration", "A Cognito subject is invalid.", 2);
    }
  }
  if (configuration.oldSubject === configuration.newSubject) {
    throw new RecoveryError("invalid_configuration", "Old and new Cognito subjects must differ.", 2);
  }
  if (
    configuration.authorizationReference.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(configuration.authorizationReference)
  ) {
    throw new RecoveryError("invalid_configuration", "Authorization reference is invalid.", 2);
  }
}

type AwsClient = Readonly<{ send(command: unknown): Promise<unknown> }>;

function attribute(
  attributes: readonly { Name?: string; Value?: string }[] | undefined,
  name: string,
) {
  return attributes?.find((item) => item.Name === name)?.Value;
}

export class AwsRecoveryCognitoAdapter implements RecoveryCognitoPort {
  private readonly client: AwsClient;

  constructor(client: AwsClient) {
    this.client = client;
  }

  async verifyReplacement(input: Readonly<{
    userPoolId: string;
    email: string;
    expectedSubject: string;
  }>) {
    try {
      const response = await this.client.send(new AdminGetUserCommand({
        UserPoolId: input.userPoolId,
        Username: input.email,
      })) as {
        Enabled?: boolean;
        UserStatus?: string;
        UserAttributes?: readonly { Name?: string; Value?: string }[];
      };
      const actualSubject = attribute(response.UserAttributes, "sub");
      const actualEmail = attribute(response.UserAttributes, "email")?.toLowerCase();
      const emailVerified = attribute(response.UserAttributes, "email_verified") === "true";
      const usableStatus = response.UserStatus === "CONFIRMED" || response.UserStatus === "FORCE_CHANGE_PASSWORD";
      if (
        response.Enabled !== true || !usableStatus || !emailVerified ||
        actualSubject !== input.expectedSubject || actualEmail !== input.email
      ) {
        throw new RecoveryError(
          "cognito_identity_mismatch",
          "The replacement Cognito identity does not safely match the approved recovery request.",
          3,
        );
      }
    } catch (error) {
      if (error instanceof RecoveryError) throw error;
      throw new RecoveryError(
        "cognito_lookup_failed",
        "Replacement Cognito identity verification failed; no database changes were attempted.",
        4,
      );
    }
  }
}

export class AwsRecoveryDatabaseAdapter implements RecoveryDatabasePort {
  private readonly configuration: Pick<
    RecoveryConfiguration,
    "clusterArn" | "adminSecretArn" | "database"
  >;
  private readonly client: AwsClient;

  constructor(
    configuration: Pick<RecoveryConfiguration, "clusterArn" | "adminSecretArn" | "database">,
    client: AwsClient,
  ) {
    this.configuration = configuration;
    this.client = client;
  }

  async evaluate(input: Readonly<{
    organizationId: string;
    staffEmail: string;
    oldSubject: string;
    newSubject: string;
    authorizedBySubject: string;
    authorizationReference: string;
    requestId: string;
    apply: boolean;
  }>): Promise<RecoveryDatabaseOutcome> {
    let transactionId: string | undefined;
    try {
      const begun = await this.client.send(new BeginTransactionCommand({
        resourceArn: this.configuration.clusterArn,
        secretArn: this.configuration.adminSecretArn,
        database: this.configuration.database,
      })) as { transactionId?: string };
      transactionId = begun.transactionId;
      if (!transactionId) throw new Error("transaction-not-started");

      const response = await this.client.send(new ExecuteStatementCommand({
        resourceArn: this.configuration.clusterArn,
        secretArn: this.configuration.adminSecretArn,
        database: this.configuration.database,
        transactionId,
        formatRecordsAs: "JSON",
        sql: `select outcome, membership_id::text, membership_role, membership_status
          from app_private.relink_staff_identity(
            :authorized_owner_subject,
            :expected_organization_id::uuid,
            :old_cognito_subject,
            :new_cognito_subject,
            :expected_email,
            :authorization_reference,
            :request_identifier,
            :apply_change
          )`,
        parameters: [
          { name: "authorized_owner_subject", value: { stringValue: input.authorizedBySubject } },
          { name: "expected_organization_id", value: { stringValue: input.organizationId } },
          { name: "old_cognito_subject", value: { stringValue: input.oldSubject } },
          { name: "new_cognito_subject", value: { stringValue: input.newSubject } },
          { name: "expected_email", value: { stringValue: input.staffEmail } },
          { name: "authorization_reference", value: { stringValue: input.authorizationReference } },
          { name: "request_identifier", value: { stringValue: input.requestId } },
          { name: "apply_change", value: { booleanValue: input.apply } },
        ],
      })) as { formattedRecords?: string };
      const records = JSON.parse(response.formattedRecords ?? "[]") as unknown;
      const outcome = Array.isArray(records) && records.length > 0
        ? (records[0] as { outcome?: unknown }).outcome
        : undefined;
      const allowed: readonly RecoveryDatabaseOutcome[] = [
        "ready", "relinked", "already_complete", "authorization_required",
        "target_not_found", "identity_mismatch", "replacement_conflict",
        "invalid_recovery_request",
      ];
      if (!allowed.includes(outcome as RecoveryDatabaseOutcome)) {
        throw new Error("unexpected-recovery-outcome");
      }
      await this.client.send(new CommitTransactionCommand({
        resourceArn: this.configuration.clusterArn,
        secretArn: this.configuration.adminSecretArn,
        transactionId,
      }));
      transactionId = undefined;
      return outcome as RecoveryDatabaseOutcome;
    } catch {
      if (transactionId) {
        try {
          await this.client.send(new RollbackTransactionCommand({
            resourceArn: this.configuration.clusterArn,
            secretArn: this.configuration.adminSecretArn,
            transactionId,
          }));
        } catch {
          // Preserve the original secret-safe failure.
        }
      }
      throw new RecoveryError(
        "database_failed",
        "Identity recovery failed and the Aurora transaction was rolled back.",
        4,
      );
    }
  }
}

function databaseFailure(outcome: Exclude<RecoveryDatabaseOutcome, "ready" | "relinked" | "already_complete">) {
  switch (outcome) {
    case "authorization_required": return "An active owner did not authorize this recovery.";
    case "target_not_found": return "The approved membership was not found in the specified organization.";
    case "identity_mismatch": return "The stored profile does not match the approved staff email.";
    case "replacement_conflict": return "The replacement Cognito subject is already linked.";
    case "invalid_recovery_request": return "Aurora rejected the recovery request as invalid.";
  }
}

export async function recoverStaffIdentity(
  configuration: RecoveryConfiguration,
  dependencies: Readonly<{
    cognito: RecoveryCognitoPort;
    database: RecoveryDatabasePort;
    output: SafeOutput;
    requestId?: () => string;
  }>,
) {
  validateRecoveryConfiguration(configuration);
  if (configuration.mode === "dry-run") {
    dependencies.output.info("Dry run complete: configuration is valid; no AWS calls or database changes were made.");
    return "dry_run" as const;
  }

  await dependencies.cognito.verifyReplacement({
    userPoolId: configuration.userPoolId,
    email: configuration.staffEmail,
    expectedSubject: configuration.newSubject,
  });
  const requestId = dependencies.requestId?.() ?? randomUUID();
  const input = {
    organizationId: configuration.organizationId,
    staffEmail: configuration.staffEmail,
    oldSubject: configuration.oldSubject,
    newSubject: configuration.newSubject,
    authorizedBySubject: configuration.authorizedBySubject,
    authorizationReference: configuration.authorizationReference,
    requestId,
  };
  const preflight = await dependencies.database.evaluate({ ...input, apply: false });
  if (preflight === "already_complete") {
    dependencies.output.info("Identity recovery is already complete; no changes were made.");
    return "already_complete" as const;
  }
  if (preflight === "relinked") {
    throw new RecoveryError(
      "database_protocol_error",
      "Aurora returned a mutating result during recovery preflight; no requested change was applied.",
      4,
    );
  }
  if (preflight !== "ready") {
    throw new RecoveryError("recovery_denied", databaseFailure(preflight), 3);
  }
  if (configuration.mode === "preflight") {
    dependencies.output.info(
      "Recovery preflight passed: Cognito and Aurora match; no database changes were made.",
    );
    return "ready" as const;
  }
  const result = await dependencies.database.evaluate({ ...input, apply: true });
  if (result !== "relinked" && result !== "already_complete") {
    throw new RecoveryError(
      "recovery_not_completed",
      "Aurora did not complete the approved identity recovery; no partial database change was committed.",
      4,
    );
  }
  dependencies.output.info(
    result === "relinked"
      ? "Identity recovery completed; organization, role, status, and audit history were preserved."
      : "Identity recovery is already complete; no changes were made.",
  );
  return result;
}

export async function runCli(
  argv: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
  output: SafeOutput = console,
) {
  try {
    const parsed = parseRecoveryArguments(argv, environment);
    if ("help" in parsed) {
      output.info(HELP);
      return 0;
    }
    if (parsed.profile) process.env.AWS_PROFILE = parsed.profile;
    await recoverStaffIdentity(parsed, {
      cognito: new AwsRecoveryCognitoAdapter(
        new CognitoIdentityProviderClient({ region: parsed.region }) as AwsClient,
      ),
      database: new AwsRecoveryDatabaseAdapter(
        parsed,
        new RDSDataClient({ region: parsed.region }) as AwsClient,
      ),
      output,
    });
    return 0;
  } catch (error) {
    if (error instanceof RecoveryError) {
      output.error(`Identity recovery stopped: ${error.message}`);
      return error.exitCode;
    }
    output.error("Identity recovery stopped because of an unexpected non-sensitive error.");
    return 4;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
