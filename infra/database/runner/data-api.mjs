import {
  BeginTransactionCommand,
  CommitTransactionCommand,
  ExecuteStatementCommand,
  RDSDataClient,
  RollbackTransactionCommand,
} from "@aws-sdk/client-rds-data";
import { MigrationRunnerError } from "./errors.mjs";
import {
  HISTORY_BOOTSTRAP_SQL,
  HISTORY_TABLE,
} from "./history.mjs";
import { splitPostgresStatements } from "./sql-parser.mjs";

class DataApiOperationError extends MigrationRunnerError {
  constructor(operation, cause) {
    const errorType =
      cause && typeof cause === "object" && typeof cause.name === "string"
        ? cause.name
        : "UnknownError";
    super(
      "DATA_API_OPERATION_FAILED",
      `RDS Data API ${operation} failed (${errorType}). No credentials, ARNs, SQL text, or endpoints are included in this message.`,
      { cause },
    );
    this.name = "DataApiOperationError";
  }
}

function parseRecords(response, operation) {
  if (!response.formattedRecords) return [];
  try {
    const records = JSON.parse(response.formattedRecords);
    if (!Array.isArray(records)) throw new Error("Expected an array.");
    return records;
  } catch (error) {
    throw new DataApiOperationError(operation, error);
  }
}

export class DataApiMigrationDatabase {
  constructor(config, client = new RDSDataClient({ region: config.region })) {
    this.config = config;
    this.client = client;
  }

  async send(operation, command) {
    try {
      return await this.client.send(command);
    } catch (error) {
      throw new DataApiOperationError(operation, error);
    }
  }

  statementInput(sql, transactionId, parameters, formatted = false) {
    return {
      resourceArn: this.config.clusterArn,
      secretArn: this.config.secretArn,
      database: this.config.databaseName,
      sql,
      ...(transactionId ? { transactionId } : {}),
      ...(parameters ? { parameters } : {}),
      ...(formatted
        ? { formatRecordsAs: "JSON", includeResultMetadata: true }
        : {}),
    };
  }

  async execute(sql, transactionId, parameters, formatted = false) {
    return this.send(
      "ExecuteStatement",
      new ExecuteStatementCommand(
        this.statementInput(sql, transactionId, parameters, formatted),
      ),
    );
  }

  async historyTableExists() {
    const response = await this.execute(
      `select exists (
         select 1 from information_schema.tables
         where table_schema = 'public'
           and table_name = 'perfect_shade_schema_migrations'
       ) as history_exists`,
      undefined,
      undefined,
      true,
    );
    const records = parseRecords(response, "history table check");
    return records[0]?.history_exists === true;
  }

  async loadHistory(transactionId) {
    const response = await this.execute(
      `select version, filename, sha256_checksum as checksum,
              applied_at::text as applied_at, duration_ms::text as duration_ms,
              runner_version
       from ${HISTORY_TABLE}
       order by version, filename`,
      transactionId,
      undefined,
      true,
    );
    return parseRecords(response, "history query").map((record) => ({
      version: String(record.version),
      filename: String(record.filename),
      checksum: String(record.checksum),
      appliedAt: String(record.applied_at ?? ""),
      durationMs:
        record.duration_ms === null || record.duration_ms === undefined
          ? null
          : String(record.duration_ms),
      runnerVersion:
        record.runner_version === null || record.runner_version === undefined
          ? null
          : String(record.runner_version),
    }));
  }

  async initializeHistory() {
    const transactionId = await this.beginTransaction();
    try {
      for (const statement of splitPostgresStatements(HISTORY_BOOTSTRAP_SQL)) {
        await this.execute(statement, transactionId);
      }
      await this.commitTransaction(transactionId);
    } catch (error) {
      try {
        await this.rollbackTransaction(transactionId);
      } catch {
        // The caller receives the original initialization error without secrets.
      }
      throw error;
    }
  }

  async beginTransaction() {
    const response = await this.send(
      "BeginTransaction",
      new BeginTransactionCommand({
        resourceArn: this.config.clusterArn,
        secretArn: this.config.secretArn,
        database: this.config.databaseName,
      }),
    );
    if (!response.transactionId) {
      throw new MigrationRunnerError(
        "DATA_API_CONTRACT_ERROR",
        "RDS Data API did not return a transaction identifier.",
      );
    }
    return response.transactionId;
  }

  async lockHistory(transactionId) {
    await this.execute(
      `lock table ${HISTORY_TABLE} in exclusive mode`,
      transactionId,
    );
  }

  async executeMigrationStatement(
    statement,
    transactionId,
    _filename,
    _statementNumber,
  ) {
    await this.execute(statement, transactionId);
  }

  async recordMigration(record, transactionId) {
    await this.execute(
      `insert into ${HISTORY_TABLE} (
         version, filename, sha256_checksum, duration_ms, runner_version
       ) values (
         :version, :filename, :checksum, cast(:duration_ms as bigint), :runner_version
       )`,
      transactionId,
      [
        { name: "version", value: { stringValue: record.version } },
        { name: "filename", value: { stringValue: record.filename } },
        { name: "checksum", value: { stringValue: record.checksum } },
        {
          name: "duration_ms",
          value: { stringValue: String(record.durationMs) },
        },
        {
          name: "runner_version",
          value: { stringValue: record.runnerVersion },
        },
      ],
    );
  }

  async commitTransaction(transactionId) {
    await this.send(
      "CommitTransaction",
      new CommitTransactionCommand({
        resourceArn: this.config.clusterArn,
        secretArn: this.config.secretArn,
        transactionId,
      }),
    );
  }

  async rollbackTransaction(transactionId) {
    await this.send(
      "RollbackTransaction",
      new RollbackTransactionCommand({
        resourceArn: this.config.clusterArn,
        secretArn: this.config.secretArn,
        transactionId,
      }),
    );
  }
}
