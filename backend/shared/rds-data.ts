import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
  type Field,
} from "@aws-sdk/client-rds-data";
import type {
  SqlRow,
  SqlStatement,
  TransactionDatabase,
} from "./database";

type DataApiClient = Readonly<{
  send(command: unknown): Promise<unknown>;
}>;

export type RdsDataConfiguration = Readonly<{
  resourceArn: string;
  secretArn: string;
  database: string;
  runtimeRole: string;
}>;

function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Database configuration is unavailable.");
  return value;
}

export function rdsDataConfigurationFromEnvironment(): RdsDataConfiguration {
  const runtimeRole = requiredEnvironment("DATABASE_RUNTIME_ROLE");
  if (!/^[a-z_][a-z0-9_]*$/.test(runtimeRole)) {
    throw new Error("Database runtime-role configuration is invalid.");
  }
  return {
    resourceArn: requiredEnvironment("DATABASE_CLUSTER_ARN"),
    secretArn: requiredEnvironment("DATABASE_SECRET_ARN"),
    database: requiredEnvironment("DATABASE_NAME"),
    runtimeRole,
  };
}

function fieldValue(field: Field | undefined): string | null {
  if (!field || field.isNull) return null;
  if (field.stringValue !== undefined) return field.stringValue;
  if (field.longValue !== undefined) return String(field.longValue);
  if (field.doubleValue !== undefined) return String(field.doubleValue);
  if (field.booleanValue !== undefined) return String(field.booleanValue);
  if (field.blobValue !== undefined) {
    return Buffer.from(field.blobValue).toString("base64");
  }
  return null;
}

export class RdsDataDatabase implements TransactionDatabase {
  private readonly client: DataApiClient;

  constructor(
    private readonly configuration: RdsDataConfiguration =
      rdsDataConfigurationFromEnvironment(),
    client: DataApiClient = new RDSDataClient({}) as DataApiClient,
  ) {
    this.client = client;
  }

  async beginTransaction(): Promise<string> {
    const response = await this.client.send(new BeginTransactionCommand({
      resourceArn: this.configuration.resourceArn,
      secretArn: this.configuration.secretArn,
      database: this.configuration.database,
    })) as { transactionId?: string };
    if (!response.transactionId) {
      throw new Error("The database did not start a transaction.");
    }

    await this.client.send(new ExecuteStatementCommand({
      resourceArn: this.configuration.resourceArn,
      secretArn: this.configuration.secretArn,
      database: this.configuration.database,
      transactionId: response.transactionId,
      sql: `set local role ${this.configuration.runtimeRole}`,
    }));
    return response.transactionId;
  }

  async execute(statement: SqlStatement): Promise<readonly SqlRow[]> {
    const response = await this.client.send(new ExecuteStatementCommand({
      resourceArn: this.configuration.resourceArn,
      secretArn: this.configuration.secretArn,
      database: this.configuration.database,
      transactionId: statement.transactionId,
      sql: statement.sql,
      includeResultMetadata: true,
      parameters: statement.parameters?.map(({ name, value }) => ({
        name,
        value: { stringValue: value },
      })),
    })) as {
      columnMetadata?: readonly { name?: string }[];
      records?: readonly (readonly Field[])[];
    };

    const columns = response.columnMetadata ?? [];
    return (response.records ?? []).map((record) =>
      Object.fromEntries(columns.map((column, index) => [
        column.name ?? `column_${index}`,
        fieldValue(record[index]),
      ])),
    );
  }

  async commitTransaction(transactionId: string): Promise<void> {
    await this.client.send(new CommitTransactionCommand({
      resourceArn: this.configuration.resourceArn,
      secretArn: this.configuration.secretArn,
      transactionId,
    }));
  }

  async rollbackTransaction(transactionId: string): Promise<void> {
    await this.client.send(new RollbackTransactionCommand({
      resourceArn: this.configuration.resourceArn,
      secretArn: this.configuration.secretArn,
      transactionId,
    }));
  }
}
