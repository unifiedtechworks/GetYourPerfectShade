export class MigrationRunnerError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = "MigrationRunnerError";
    this.code = code;
  }
}

export class InvalidMigrationStateError extends MigrationRunnerError {
  constructor(issues) {
    super(
      "INVALID_MIGRATION_STATE",
      `Migration history is invalid:\n- ${issues.join("\n- ")}`,
    );
    this.name = "InvalidMigrationStateError";
    this.issues = issues;
  }
}

export class MigrationApplyError extends MigrationRunnerError {
  constructor(filename, statementNumber, rollbackConfirmed, cause) {
    const rollback = rollbackConfirmed
      ? "The transaction was rolled back."
      : "Rollback could not be confirmed; inspect the transaction before retrying.";
    super(
      "MIGRATION_APPLY_FAILED",
      `Migration ${filename} failed at statement ${statementNumber}. ${rollback}`,
      { cause },
    );
    this.name = "MigrationApplyError";
    this.filename = filename;
    this.statementNumber = statementNumber;
    this.rollbackConfirmed = rollbackConfirmed;
  }
}
