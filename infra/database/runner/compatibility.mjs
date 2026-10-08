import { createHash } from "node:crypto";
import { MigrationCompatibilityError } from "./errors.mjs";

// These identify immutable file bytes and the exact output of our SQL parser.
// A changed file or statement requires review; it cannot inherit this exception.
export const LEGACY_RUNTIME_ROLE_BOOTSTRAP = Object.freeze({
  filename: "0001_account_foundation.sql",
  version: "0001",
  statementNumber: 4,
  migrationChecksum:
    "efebbb1ad193d5a110e152a99565867504f88aa313413226237a957ce4e7d7e3",
  statementChecksum:
    "7c262ffd6e8e3846a9038c8d159cbdabefe22555f77e79d2141d717b0bc8c2d4",
});

const REQUIRED_ROLE_ATTRIBUTES = Object.freeze({
  rolcanlogin: true,
  rolinherit: false,
  rolsuper: false,
  rolcreatedb: false,
  rolcreaterole: false,
  rolreplication: false,
  rolbypassrls: false,
});

export const LEGACY_RUNTIME_ROLE_SATISFIED_MESSAGE =
  "Legacy 0001 runtime-role bootstrap satisfied by provisioned restricted role.";

export async function legacyRuntimeRoleBootstrapSatisfied({
  database,
  migration,
  statement,
  statementNumber,
  transactionId,
}) {
  const legacy = LEGACY_RUNTIME_ROLE_BOOTSTRAP;
  if (
    migration.filename !== legacy.filename ||
    statementNumber !== legacy.statementNumber
  ) {
    return false;
  }

  if (
    migration.version !== legacy.version ||
    migration.checksum !== legacy.migrationChecksum ||
    createHash("sha256").update(statement, "utf8").digest("hex") !==
      legacy.statementChecksum
  ) {
    throw new MigrationCompatibilityError(
      "LEGACY_RUNTIME_ROLE_FINGERPRINT_MISMATCH",
      "Legacy 0001 runtime-role bootstrap fingerprint differs from the reviewed immutable statement; compatibility refused.",
    );
  }

  const role = await database.inspectRuntimeRole(transactionId);
  if (!role) {
    throw new MigrationCompatibilityError(
      "PROVISIONED_RUNTIME_ROLE_MISSING",
      "The restricted runtime role is missing; the infrastructure runtime-role provisioner must succeed before migrations.",
    );
  }
  for (const [attribute, expected] of Object.entries(REQUIRED_ROLE_ATTRIBUTES)) {
    if (role[attribute] !== expected) {
      throw new MigrationCompatibilityError(
        "PROVISIONED_RUNTIME_ROLE_ATTRIBUTES_INVALID",
        `The provisioned runtime role has an unexpected ${attribute} attribute; compatibility refused without altering the role.`,
      );
    }
  }
  return true;
}
