import {
  MigrationApplyError,
  MigrationRunnerError,
} from "./errors.mjs";
import { RUNNER_VERSION, validateMigrationHistory } from "./history.mjs";

async function inspect(database, migrations) {
  const historyExists = await database.historyTableExists();
  const history = historyExists ? await database.loadHistory() : [];
  return {
    historyExists,
    ...validateMigrationHistory(migrations, history),
  };
}

export async function migrationStatus(database, migrations) {
  return inspect(database, migrations);
}

export async function migrationPlan(database, migrations) {
  return inspect(database, migrations);
}

async function rollbackQuietly(database, transactionId) {
  try {
    await database.rollbackTransaction(transactionId);
    return true;
  } catch {
    return false;
  }
}

export async function applyMigrations(
  database,
  migrations,
  clock = () => Date.now(),
) {
  let state = await inspect(database, migrations);
  if (!state.historyExists) {
    await database.initializeHistory();
    state = await inspect(database, migrations);
  }

  const applied = [];
  for (const migration of state.pending) {
    const transactionId = await database.beginTransaction();
    let statementNumber = 0;
    try {
      await database.lockHistory(transactionId);
      const currentHistory = await database.loadHistory(transactionId);
      const currentState = validateMigrationHistory(migrations, currentHistory);

      if (
        currentState.applied.some(
          (item) => item.filename === migration.filename,
        )
      ) {
        await database.commitTransaction(transactionId);
        continue;
      }
      if (currentState.pending[0]?.filename !== migration.filename) {
        throw new MigrationRunnerError(
          "MIGRATION_ORDER_CHANGED",
          "Migration order changed while apply was running; retry after confirming no other runner is active.",
        );
      }

      const startedAt = clock();
      for (const statement of migration.statements) {
        statementNumber += 1;
        await database.executeMigrationStatement(
          statement,
          transactionId,
          migration.filename,
          statementNumber,
        );
      }
      await database.recordMigration(
        {
          version: migration.version,
          filename: migration.filename,
          checksum: migration.checksum,
          durationMs: Math.max(0, clock() - startedAt),
          runnerVersion: RUNNER_VERSION,
        },
        transactionId,
      );
      await database.commitTransaction(transactionId);
      applied.push(migration);
    } catch (error) {
      const rollbackConfirmed = await rollbackQuietly(database, transactionId);
      throw new MigrationApplyError(
        migration.filename,
        Math.max(statementNumber, 1),
        rollbackConfirmed,
        error,
      );
    }
  }

  return {
    appliedNow: applied,
    ...(await inspect(database, migrations)),
  };
}
