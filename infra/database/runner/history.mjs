import { InvalidMigrationStateError } from "./errors.mjs";
import { MIGRATION_FILENAME_PATTERN } from "./migration-files.mjs";

export const HISTORY_TABLE = "public.perfect_shade_schema_migrations";
export const RUNNER_VERSION = "1.0.0";

export const HISTORY_BOOTSTRAP_SQL = `
create table public.perfect_shade_schema_migrations (
  version text primary key,
  filename text not null unique,
  sha256_checksum char(64) not null
    check (sha256_checksum ~ '^[0-9a-f]{64}$'),
  applied_at timestamptz not null default now(),
  duration_ms bigint,
  runner_version text,
  check (version ~ '^[0-9]+$'),
  check (filename ~ '^[0-9]+_[a-z0-9][a-z0-9_-]*\\.sql$'),
  check (duration_ms is null or duration_ms >= 0)
);

create or replace function public.prevent_perfect_shade_migration_history_mutation()
returns trigger
language plpgsql
set search_path = ''
as $history$
begin
  raise exception 'migration_history_is_immutable' using errcode = '55000';
end
$history$;

create trigger perfect_shade_migration_history_immutable
before update or delete on public.perfect_shade_schema_migrations
for each row execute function public.prevent_perfect_shade_migration_history_mutation();

create trigger perfect_shade_migration_history_no_truncate
before truncate on public.perfect_shade_schema_migrations
for each statement execute function public.prevent_perfect_shade_migration_history_mutation();

revoke update, delete, truncate on public.perfect_shade_schema_migrations from public;
`;

export function validateMigrationHistory(migrations, history) {
  const issues = [];
  const localByFilename = new Map(
    migrations.map((migration) => [migration.filename, migration]),
  );
  const historyByFilename = new Map();
  const historyVersions = new Map();

  for (const record of history) {
    if (historyByFilename.has(record.filename)) {
      issues.push(`History contains duplicate filename ${record.filename}.`);
    }
    historyByFilename.set(record.filename, record);

    const normalizedVersion = /^\d+$/.test(record.version)
      ? BigInt(record.version).toString()
      : record.version;
    if (historyVersions.has(normalizedVersion)) {
      issues.push(`History contains duplicate version ${record.version}.`);
    }
    historyVersions.set(normalizedVersion, record.filename);

    const filenameMatch = MIGRATION_FILENAME_PATTERN.exec(record.filename);
    if (!filenameMatch) {
      issues.push(`History filename ${record.filename} is malformed.`);
    } else if (filenameMatch[1] !== record.version) {
      issues.push(
        `History version ${record.version} does not match filename ${record.filename}.`,
      );
    }
    if (!/^[0-9a-f]{64}$/.test(record.checksum)) {
      issues.push(`History checksum for ${record.filename} is malformed.`);
    }
    if (!record.appliedAt) {
      issues.push(`History entry ${record.filename} has no applied timestamp.`);
    }

    const local = localByFilename.get(record.filename);
    if (!local) {
      issues.push(
        `Applied migration ${record.filename} is missing from the migration directory.`,
      );
    } else {
      if (local.version !== record.version) {
        issues.push(`Applied migration ${record.filename} has a changed version.`);
      }
      if (local.checksum !== record.checksum) {
        issues.push(`Checksum mismatch for applied migration ${record.filename}.`);
      }
    }
  }

  let pendingSeen = false;
  for (const migration of migrations) {
    const applied = historyByFilename.has(migration.filename);
    if (!applied) pendingSeen = true;
    else if (pendingSeen) {
      issues.push(
        `Applied migration ${migration.filename} appears after a pending migration.`,
      );
    }
  }

  if (issues.length > 0) throw new InvalidMigrationStateError(issues);
  return {
    applied: migrations.filter((migration) =>
      historyByFilename.has(migration.filename),
    ),
    pending: migrations.filter(
      (migration) => !historyByFilename.has(migration.filename),
    ),
    history,
  };
}
