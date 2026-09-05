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

export const HELP = `Perfect Shade additional owner provisioning

Usage:
  pnpm owner:add -- --dry-run [options]
  pnpm owner:add -- --preflight [options]
  pnpm owner:add -- --execute [options]

Required options (or matching environment variables):
  --region <region>                    AWS_REGION
  --user-pool-id <id>                  COGNITO_USER_POOL_ID
  --cluster-arn <arn>                   DATABASE_CLUSTER_ARN
  --admin-secret-arn <arn>              DATABASE_ADMIN_SECRET_ARN
  --database <name>                     DATABASE_NAME
  --organization-id <uuid>              OWNER_ORGANIZATION_ID
  --owner-email <email>                  ADDITIONAL_OWNER_EMAIL
  --authorized-by-subject <sub>         AUTHORIZING_OWNER_SUB
  --authorization-reference <reference> OWNER_AUTHORIZATION_REFERENCE

Credential and safety options:
  --profile <name>                      AWS_PROFILE (normal AWS credential resolution)
  --resume-existing-user                Continue only after verifying an existing Cognito user
  --dry-run                             Validate configuration; make no AWS calls
  --preflight                           Verify Cognito/Aurora readiness; make no changes
  --execute                             Provision the approved additional owner
  --help                                Show this help

Cognito generates and delivers temporary credentials. No password is accepted or printed.
This command can create only an owner and has no role option or application API endpoint.`;

export type OwnerProvisioningMode = "dry-run" | "preflight" | "execute";

export type OwnerProvisioningConfiguration = Readonly<{
  region: string;
  userPoolId: string;
  clusterArn: string;
  adminSecretArn: string;
  database: string;
  organizationId: string;
  ownerEmail: string;
  authorizedBySubject: string;
  authorizationReference: string;
  profile?: string;
  resumeExistingUser: boolean;
  mode: OwnerProvisioningMode;
}>;

export type OwnerProvisioningOutcome = "created" | "already_complete" | "dry_run" | "ready";

export type OwnerDatabaseOutcome =
  | "ready"
  | "created"
  | "already_complete"
  | "organization_missing"
  | "no_active_owner"
  | "authorization_required"
  | "cross_organization_conflict"
  | "identity_conflict"
  | "invalid_request";

export type OwnerIdentity = Readonly<{ subject: string; email: string }>;

export interface OwnerCognitoPort {
  findUser(userPoolId: string, email: string): Promise<OwnerIdentity | null>;
  createUser(userPoolId: string, email: string): Promise<OwnerIdentity>;
}

export interface AdditionalOwnerDatabasePort {
  evaluate(input: Readonly<{
    organizationId: string;
    ownerSubject: string | null;
    ownerEmail: string;
    authorizedBySubject: string;
    authorizationReference: string;
    requestId: string;
    apply: boolean;
  }>): Promise<OwnerDatabaseOutcome>;
}

export interface SafeOutput {
  info(message: string): void;
  error(message: string): void;
}

export class OwnerProvisioningError extends Error {
  readonly code: string;
  readonly exitCode: number;

  constructor(code: string, message: string, exitCode: number) {
    super(message);
    this.name = "OwnerProvisioningError";
    this.code = code;
    this.exitCode = exitCode;
  }
}

const VALUE_FLAGS = new Map<string, keyof Omit<
  OwnerProvisioningConfiguration,
  "mode" | "resumeExistingUser"
>>([
  ["--region", "region"],
  ["--user-pool-id", "userPoolId"],
  ["--cluster-arn", "clusterArn"],
  ["--admin-secret-arn", "adminSecretArn"],
  ["--database", "database"],
  ["--organization-id", "organizationId"],
  ["--owner-email", "ownerEmail"],
  ["--authorized-by-subject", "authorizedBySubject"],
  ["--authorization-reference", "authorizationReference"],
  ["--profile", "profile"],
]);

function required(value: string | undefined, label: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new OwnerProvisioningError("missing_configuration", `${label} is required.`, 2);
  }
  return normalized;
}

export function parseOwnerProvisioningArguments(
  argv: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
): OwnerProvisioningConfiguration | { help: true } {
  const values: Partial<Record<
    keyof Omit<OwnerProvisioningConfiguration, "mode" | "resumeExistingUser">,
    string
  >> = {
    region: environment.AWS_REGION,
    userPoolId: environment.COGNITO_USER_POOL_ID,
    clusterArn: environment.DATABASE_CLUSTER_ARN,
    adminSecretArn: environment.DATABASE_ADMIN_SECRET_ARN,
    database: environment.DATABASE_NAME,
    organizationId: environment.OWNER_ORGANIZATION_ID,
    ownerEmail: environment.ADDITIONAL_OWNER_EMAIL,
    authorizedBySubject: environment.AUTHORIZING_OWNER_SUB,
    authorizationReference: environment.OWNER_AUTHORIZATION_REFERENCE,
    profile: environment.AWS_PROFILE,
  };
  let mode: OwnerProvisioningMode | undefined;
  let resumeExistingUser = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--resume-existing-user") {
      resumeExistingUser = true;
      continue;
    }
    if (["--dry-run", "--preflight", "--execute"].includes(argument)) {
      const requested = argument.slice(2) as OwnerProvisioningMode;
      if (mode && mode !== requested) {
        throw new OwnerProvisioningError(
          "invalid_argument",
          "Choose exactly one owner-provisioning execution mode.",
          2,
        );
      }
      mode = requested;
      continue;
    }
    const target = VALUE_FLAGS.get(argument);
    if (!target) {
      throw new OwnerProvisioningError(
        "invalid_argument",
        `Unsupported option: ${argument}. Password and role selection are not permitted.`,
        2,
      );
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new OwnerProvisioningError("invalid_argument", `${argument} requires a value.`, 2);
    }
    values[target] = value;
    index += 1;
  }

  if (!mode) {
    throw new OwnerProvisioningError(
      "missing_mode",
      "Choose exactly one of --dry-run, --preflight, or --execute.",
      2,
    );
  }

  const configuration: OwnerProvisioningConfiguration = {
    region: required(values.region, "AWS region"),
    userPoolId: required(values.userPoolId, "Cognito User Pool ID"),
    clusterArn: required(values.clusterArn, "Aurora cluster ARN"),
    adminSecretArn: required(values.adminSecretArn, "Aurora admin/migration secret ARN"),
    database: required(values.database, "Database name"),
    organizationId: required(values.organizationId, "Organization ID"),
    ownerEmail: required(values.ownerEmail, "Additional owner email").toLowerCase(),
    authorizedBySubject: required(values.authorizedBySubject, "Authorizing owner subject"),
    authorizationReference: required(values.authorizationReference, "Authorization reference"),
    profile: values.profile?.trim() || undefined,
    resumeExistingUser,
    mode,
  };
  validateOwnerProvisioningConfiguration(configuration);
  return configuration;
}

export function validateOwnerProvisioningConfiguration(
  configuration: OwnerProvisioningConfiguration,
) {
  if (!/^[a-z]{2}(?:-gov)?-[a-z]+-\d$/.test(configuration.region)) {
    throw new OwnerProvisioningError("invalid_configuration", "AWS region is invalid.", 2);
  }
  if (!configuration.userPoolId.startsWith(`${configuration.region}_`)) {
    throw new OwnerProvisioningError(
      "invalid_configuration",
      "Cognito User Pool ID does not match the configured region.",
      2,
    );
  }
  if (!/^arn:[^:]+:rds:[^:]+:[0-9]{12}:cluster:[A-Za-z0-9-]+$/.test(configuration.clusterArn)) {
    throw new OwnerProvisioningError("invalid_configuration", "Aurora cluster ARN is invalid.", 2);
  }
  if (!/^arn:[^:]+:secretsmanager:[^:]+:[0-9]{12}:secret:[^\s]+$/.test(configuration.adminSecretArn)) {
    throw new OwnerProvisioningError(
      "invalid_configuration",
      "Aurora admin/migration secret ARN is invalid.",
      2,
    );
  }
  if (/\/aurora\/runtime(?:-|$)/i.test(configuration.adminSecretArn)) {
    throw new OwnerProvisioningError(
      "invalid_configuration",
      "The restricted application runtime secret cannot provision an owner.",
      2,
    );
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(configuration.database)) {
    throw new OwnerProvisioningError("invalid_configuration", "Database name is invalid.", 2);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(configuration.organizationId)) {
    throw new OwnerProvisioningError(
      "invalid_configuration",
      "Organization ID must be a UUID.",
      2,
    );
  }
  if (
    configuration.ownerEmail.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuration.ownerEmail)
  ) {
    throw new OwnerProvisioningError("invalid_configuration", "Additional owner email is invalid.", 2);
  }
  if (
    configuration.authorizedBySubject.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(configuration.authorizedBySubject)
  ) {
    throw new OwnerProvisioningError("invalid_configuration", "Authorizing owner subject is invalid.", 2);
  }
  if (
    configuration.authorizationReference.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(configuration.authorizationReference)
  ) {
    throw new OwnerProvisioningError("invalid_configuration", "Authorization reference is invalid.", 2);
  }
  if (configuration.profile && /[\u0000-\u001f\u007f]/.test(configuration.profile)) {
    throw new OwnerProvisioningError("invalid_configuration", "AWS profile is invalid.", 2);
  }
}

function attribute(
  attributes: readonly { Name?: string; Value?: string }[] | undefined,
  name: string,
) {
  return attributes?.find((item) => item.Name === name)?.Value;
}

type AwsClient = Readonly<{ send(command: unknown): Promise<unknown> }>;

export class AwsAdditionalOwnerCognitoAdapter implements OwnerCognitoPort {
  private readonly client: AwsClient;

  constructor(client: AwsClient) {
    this.client = client;
  }

  async findUser(userPoolId: string, email: string): Promise<OwnerIdentity | null> {
    try {
      const response = await this.client.send(new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: email,
      })) as {
        Enabled?: boolean;
        UserStatus?: string;
        UserAttributes?: readonly { Name?: string; Value?: string }[];
      };
      const subject = attribute(response.UserAttributes, "sub");
      const storedEmail = attribute(response.UserAttributes, "email")?.toLowerCase();
      const verified = attribute(response.UserAttributes, "email_verified") === "true";
      const usableStatus = response.UserStatus === "CONFIRMED" ||
        response.UserStatus === "FORCE_CHANGE_PASSWORD";
      if (
        !subject || storedEmail !== email.toLowerCase() || !verified ||
        response.Enabled !== true || !usableStatus
      ) {
        throw new OwnerProvisioningError(
          "cognito_identity_mismatch",
          "The existing Cognito identity is not eligible for approved owner provisioning.",
          3,
        );
      }
      return { subject, email: storedEmail };
    } catch (error) {
      if ((error as { name?: string }).name === "UserNotFoundException") return null;
      if (error instanceof OwnerProvisioningError) throw error;
      throw new OwnerProvisioningError(
        "cognito_lookup_failed",
        "Cognito user lookup failed. No database changes were attempted.",
        4,
      );
    }
  }

  async createUser(userPoolId: string, email: string): Promise<OwnerIdentity> {
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
      const subject = attribute(response.User?.Attributes, "sub");
      const storedEmail = attribute(response.User?.Attributes, "email")?.toLowerCase();
      if (!subject || storedEmail !== email.toLowerCase()) throw new Error("uncertain-create-result");
      return { subject, email: storedEmail };
    } catch (error) {
      if ((error as { name?: string }).name === "UsernameExistsException") {
        throw new OwnerProvisioningError(
          "existing_cognito_user",
          "The Cognito user already exists. Verify it, then rerun with --resume-existing-user.",
          3,
        );
      }
      throw new OwnerProvisioningError(
        "cognito_create_failed",
        "Cognito owner creation failed or returned an uncertain result. Do not create another user until the identity is inspected safely.",
        4,
      );
    }
  }
}

function missingMigration(error: unknown) {
  const message = error && typeof error === "object" && "message" in error &&
    typeof error.message === "string"
    ? error.message.toLowerCase()
    : "";
  return message.includes("app_private.provision_additional_owner") &&
    /does not exist|undefined_function|42883/.test(message);
}

export class AwsAdditionalOwnerDatabaseAdapter implements AdditionalOwnerDatabasePort {
  private readonly configuration: Pick<
    OwnerProvisioningConfiguration,
    "clusterArn" | "adminSecretArn" | "database"
  >;
  private readonly client: AwsClient;

  constructor(
    configuration: Pick<
      OwnerProvisioningConfiguration,
      "clusterArn" | "adminSecretArn" | "database"
    >,
    client: AwsClient,
  ) {
    this.configuration = configuration;
    this.client = client;
  }

  async evaluate(input: Readonly<{
    organizationId: string;
    ownerSubject: string | null;
    ownerEmail: string;
    authorizedBySubject: string;
    authorizationReference: string;
    requestId: string;
    apply: boolean;
  }>): Promise<OwnerDatabaseOutcome> {
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
          from app_private.provision_additional_owner(
            :expected_organization_id::uuid,
            :new_owner_subject,
            :new_owner_email,
            :authorized_owner_subject,
            :authorization_reference,
            :request_identifier,
            :apply_change
          )`,
        parameters: [
          { name: "expected_organization_id", value: { stringValue: input.organizationId } },
          {
            name: "new_owner_subject",
            value: input.ownerSubject
              ? { stringValue: input.ownerSubject }
              : { isNull: true },
          },
          { name: "new_owner_email", value: { stringValue: input.ownerEmail } },
          { name: "authorized_owner_subject", value: { stringValue: input.authorizedBySubject } },
          { name: "authorization_reference", value: { stringValue: input.authorizationReference } },
          { name: "request_identifier", value: { stringValue: input.requestId } },
          { name: "apply_change", value: { booleanValue: input.apply } },
        ],
      })) as { formattedRecords?: string };
      const records = JSON.parse(response.formattedRecords ?? "[]") as unknown;
      const outcome = Array.isArray(records) && records.length > 0
        ? (records[0] as { outcome?: unknown }).outcome
        : undefined;
      const allowed: readonly OwnerDatabaseOutcome[] = [
        "ready",
        "created",
        "already_complete",
        "organization_missing",
        "no_active_owner",
        "authorization_required",
        "cross_organization_conflict",
        "identity_conflict",
        "invalid_request",
      ];
      if (!allowed.includes(outcome as OwnerDatabaseOutcome)) {
        throw new Error("unexpected-owner-provisioning-outcome");
      }

      await this.client.send(new CommitTransactionCommand({
        resourceArn: this.configuration.clusterArn,
        secretArn: this.configuration.adminSecretArn,
        transactionId,
      }));
      transactionId = undefined;
      return outcome as OwnerDatabaseOutcome;
    } catch (error) {
      if (transactionId) {
        try {
          await this.client.send(new RollbackTransactionCommand({
            resourceArn: this.configuration.clusterArn,
            secretArn: this.configuration.adminSecretArn,
            transactionId,
          }));
        } catch {
          // Preserve the original secret-safe error.
        }
      }
      if (missingMigration(error)) {
        throw new OwnerProvisioningError(
          "missing_migration",
          "Additional-owner provisioning is unavailable. Apply migration 0009_additional_owner_provisioning.sql through the approved migration runner, then retry.",
          3,
        );
      }
      throw new OwnerProvisioningError(
        "database_failed",
        "Additional-owner provisioning failed and the Aurora transaction was rolled back.",
        4,
      );
    }
  }
}

function databaseOutcomeMessage(
  outcome: Exclude<OwnerDatabaseOutcome, "ready" | "created" | "already_complete">,
) {
  switch (outcome) {
    case "organization_missing":
      return "The specified organization does not exist.";
    case "no_active_owner":
      return "The organization does not have an active existing owner.";
    case "authorization_required":
      return "The authorizing subject is not an active owner of the specified organization.";
    case "cross_organization_conflict":
      return "The intended identity is linked to another organization; no changes were made.";
    case "identity_conflict":
      return "Existing profile or membership data conflicts with the intended additional owner.";
    case "invalid_request":
      return "Aurora rejected the additional-owner request as invalid.";
  }
}

export async function provisionAdditionalOwner(
  configuration: OwnerProvisioningConfiguration,
  dependencies: Readonly<{
    cognito: OwnerCognitoPort;
    database: AdditionalOwnerDatabasePort;
    output: SafeOutput;
    requestId?: () => string;
  }>,
): Promise<OwnerProvisioningOutcome> {
  validateOwnerProvisioningConfiguration(configuration);
  if (configuration.mode === "dry-run") {
    dependencies.output.info(
      "Dry run complete: configuration is valid; no AWS calls or database changes were made.",
    );
    return "dry_run";
  }

  const user = await dependencies.cognito.findUser(
    configuration.userPoolId,
    configuration.ownerEmail,
  );
  const requestId = dependencies.requestId?.() ?? randomUUID();
  const input = {
    organizationId: configuration.organizationId,
    ownerSubject: user?.subject ?? null,
    ownerEmail: configuration.ownerEmail,
    authorizedBySubject: configuration.authorizedBySubject,
    authorizationReference: configuration.authorizationReference,
    requestId,
  };
  const preflight = await dependencies.database.evaluate({ ...input, apply: false });
  if (preflight === "already_complete") {
    dependencies.output.info("Additional owner provisioning is already complete; no changes were made.");
    return "already_complete";
  }
  if (preflight === "created") {
    throw new OwnerProvisioningError(
      "database_protocol_error",
      "Aurora returned a mutating result during preflight; no requested change was applied.",
      4,
    );
  }
  if (preflight !== "ready") {
    throw new OwnerProvisioningError(
      "provisioning_denied",
      databaseOutcomeMessage(preflight),
      3,
    );
  }
  if (user && !configuration.resumeExistingUser) {
    throw new OwnerProvisioningError(
      "existing_cognito_user",
      "The Cognito user already exists but owner provisioning is incomplete. Verify the identity, then rerun with --resume-existing-user.",
      3,
    );
  }
  if (configuration.mode === "preflight") {
    dependencies.output.info(
      user
        ? "Preflight passed for the explicitly resumed Cognito identity; no changes were made."
        : "Preflight passed; Cognito would create and invite the additional owner during execution.",
    );
    return "ready";
  }

  let intendedUser = user;
  let cognitoCreated = false;
  if (!intendedUser) {
    intendedUser = await dependencies.cognito.createUser(
      configuration.userPoolId,
      configuration.ownerEmail,
    );
    cognitoCreated = true;
  }

  let result: OwnerDatabaseOutcome;
  try {
    result = await dependencies.database.evaluate({
      ...input,
      ownerSubject: intendedUser.subject,
      apply: true,
    });
  } catch (error) {
    if (!cognitoCreated && error instanceof OwnerProvisioningError) throw error;
    throw new OwnerProvisioningError(
      cognitoCreated ? "partial_external_failure" : "database_failed",
      cognitoCreated
        ? "Cognito created the owner identity, but Aurora setup failed. Do not create another user. Resolve the database issue and rerun with --resume-existing-user."
        : "Aurora owner setup failed; the database transaction was rolled back.",
      4,
    );
  }

  if (result === "created") {
    dependencies.output.info(
      "Additional owner provisioning completed. Cognito requires first-login password completion and any configured MFA enrollment.",
    );
    return "created";
  }
  if (result === "already_complete") {
    dependencies.output.info("Additional owner provisioning is already complete; no changes were made.");
    return "already_complete";
  }
  if (result === "ready") {
    throw new OwnerProvisioningError(
      "database_protocol_error",
      "Aurora did not apply the approved additional-owner request.",
      4,
    );
  }
  throw new OwnerProvisioningError(
    cognitoCreated ? "partial_external_failure" : "provisioning_denied",
    cognitoCreated
      ? "Cognito created the owner identity, but Aurora rejected account setup. Do not create another user; resolve the recorded conflict and rerun with --resume-existing-user."
      : databaseOutcomeMessage(result),
    cognitoCreated ? 4 : 3,
  );
}

export async function runCli(
  argv: readonly string[],
  environment: Readonly<Record<string, string | undefined>> = process.env,
  output: SafeOutput = console,
) {
  try {
    const parsed = parseOwnerProvisioningArguments(argv, environment);
    if ("help" in parsed) {
      output.info(HELP);
      return 0;
    }
    if (parsed.profile) process.env.AWS_PROFILE = parsed.profile;
    await provisionAdditionalOwner(parsed, {
      cognito: new AwsAdditionalOwnerCognitoAdapter(
        new CognitoIdentityProviderClient({ region: parsed.region }) as AwsClient,
      ),
      database: new AwsAdditionalOwnerDatabaseAdapter(
        parsed,
        new RDSDataClient({ region: parsed.region }) as AwsClient,
      ),
      output,
    });
    return 0;
  } catch (error) {
    if (error instanceof OwnerProvisioningError) {
      output.error(`Additional owner provisioning stopped: ${error.message}`);
      return error.exitCode;
    }
    output.error("Additional owner provisioning stopped because of an unexpected non-sensitive error.");
    return 4;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runCli(process.argv.slice(2)).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
