import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
} from "@aws-sdk/client-rds-data";
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from "@aws-sdk/client-secrets-manager";

type Client = Readonly<{ send(command: unknown): Promise<unknown> }>;

export type RuntimeCredentialConfiguration = Readonly<{
  clusterArn: string;
  adminSecretArn: string;
  runtimeSecretArn: string;
  databaseName: string;
}>;

type ProvisioningEvent = Readonly<{
  RequestType: "Create" | "Update" | "Delete";
  RequestId?: string;
}>;

const PHYSICAL_RESOURCE_ID = "perfect-shade-runtime-database-credentials";

const PROVISION_RUNTIME_ROLE_SQL = `
do $runtime_credentials$
declare
  runtime_password text := current_setting('perfect_shade.runtime_password');
begin
  if runtime_password is null or length(runtime_password) < 20 then
    raise exception 'runtime_database_password_invalid';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_roles
    where rolname = 'perfect_shade_app_runtime'
  ) then
    create role perfect_shade_app_runtime
      login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  else
    alter role perfect_shade_app_runtime
      login noinherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;

  execute format(
    'alter role perfect_shade_app_runtime password %L',
    runtime_password
  );
end
$runtime_credentials$;
`;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error("Runtime database credential configuration is unavailable.");
  }
  return value;
}

export function runtimeCredentialConfigurationFromEnvironment(): RuntimeCredentialConfiguration {
  return {
    clusterArn: requiredEnvironment("DATABASE_CLUSTER_ARN"),
    adminSecretArn: requiredEnvironment("DATABASE_ADMIN_SECRET_ARN"),
    runtimeSecretArn: requiredEnvironment("DATABASE_RUNTIME_SECRET_ARN"),
    databaseName: requiredEnvironment("DATABASE_NAME"),
  };
}

function runtimeCredentials(secretString: string | undefined): Readonly<{
  username: "perfect_shade_app_runtime";
  password: string;
}> {
  let value: unknown;
  try {
    value = JSON.parse(secretString ?? "");
  } catch {
    throw new Error("The runtime database secret contract is invalid.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The runtime database secret contract is invalid.");
  }
  const record = value as Record<string, unknown>;
  if (
    record.username !== "perfect_shade_app_runtime" ||
    typeof record.password !== "string" ||
    record.password.length < 20 ||
    record.password.length > 1024
  ) {
    throw new Error("The runtime database secret contract is invalid.");
  }
  return {
    username: "perfect_shade_app_runtime",
    password: record.password,
  };
}

function safeProvisioningLog(
  outcome: "success" | "failure",
  requestId: string | undefined,
): void {
  const event = {
    eventType: "runtime_database_credential_provisioning",
    operation: "provision_runtime_database_credentials",
    outcome,
    requestId: typeof requestId === "string" && requestId.length <= 128
      ? requestId
      : "unknown",
    ...(outcome === "failure"
      ? { errorCode: "runtime_database_provisioning_failed" }
      : {}),
  };
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

export function createRuntimeCredentialProvisioner(options: Readonly<{
  configuration?: RuntimeCredentialConfiguration;
  rdsClient?: Client;
  secretsClient?: Client;
}> = {}) {
  const configuration = options.configuration ??
    runtimeCredentialConfigurationFromEnvironment();
  const rds = options.rdsClient ?? new RDSDataClient({});
  const secrets = options.secretsClient ?? new SecretsManagerClient({});

  return async function provisionRuntimeCredential(event: ProvisioningEvent) {
    if (event.RequestType === "Delete") {
      return { PhysicalResourceId: PHYSICAL_RESOURCE_ID };
    }
    if (event.RequestType !== "Create" && event.RequestType !== "Update") {
      throw new Error("The runtime database provisioning request is invalid.");
    }

    let transactionId = "";
    try {
      const secret = await secrets.send(new GetSecretValueCommand({
        SecretId: configuration.runtimeSecretArn,
      })) as { SecretString?: string };
      const credential = runtimeCredentials(secret.SecretString);

      const transaction = await rds.send(new BeginTransactionCommand({
        resourceArn: configuration.clusterArn,
        secretArn: configuration.adminSecretArn,
        database: configuration.databaseName,
      })) as { transactionId?: string };
      transactionId = transaction.transactionId ?? "";
      if (!transactionId) {
        throw new Error("The administrative database transaction did not start.");
      }

      await rds.send(new ExecuteStatementCommand({
        resourceArn: configuration.clusterArn,
        secretArn: configuration.adminSecretArn,
        database: configuration.databaseName,
        transactionId,
        sql: "select set_config('perfect_shade.runtime_password', :password, true)",
        parameters: [{
          name: "password",
          value: { stringValue: credential.password },
        }],
      }));
      await rds.send(new ExecuteStatementCommand({
        resourceArn: configuration.clusterArn,
        secretArn: configuration.adminSecretArn,
        database: configuration.databaseName,
        transactionId,
        sql: PROVISION_RUNTIME_ROLE_SQL,
      }));
      await rds.send(new CommitTransactionCommand({
        resourceArn: configuration.clusterArn,
        secretArn: configuration.adminSecretArn,
        transactionId,
      }));
      safeProvisioningLog("success", event.RequestId);
      return { PhysicalResourceId: PHYSICAL_RESOURCE_ID };
    } catch {
      if (transactionId) {
        try {
          await rds.send(new RollbackTransactionCommand({
            resourceArn: configuration.clusterArn,
            secretArn: configuration.adminSecretArn,
            transactionId,
          }));
        } catch {
          // Preserve the secret-safe provisioning failure below.
        }
      }
      safeProvisioningLog("failure", event.RequestId);
      throw new Error("Runtime database credential provisioning failed.");
    }
  };
}

let defaultProvisioner:
  | ReturnType<typeof createRuntimeCredentialProvisioner>
  | undefined;

export async function handler(event: ProvisioningEvent) {
  defaultProvisioner ??= createRuntimeCredentialProvisioner();
  return defaultProvisioner(event);
}
