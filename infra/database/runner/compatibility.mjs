import { createHash } from "node:crypto";
import { MigrationCompatibilityError } from "./errors.mjs";

// The canonical identity is the immutable Git LF file and parsed statement.
// The loader supplies a raw history checksum, so allow only these two verified
// byte-representation pairs instead of normalizing or changing history policy.
// Mixed endings, mismatched pairs, or any other content change fail closed.
export const LEGACY_RUNTIME_ROLE_BOOTSTRAP = Object.freeze({
  filename: "0001_account_foundation.sql",
  version: "0001",
  statementNumber: 4,
  migrationChecksum:
    "19a8429b33e6eb2fe513e00926a6a2187a76c45264ca35b88e863b904149456b",
  statementChecksum:
    "8a1fe184711a2271c1ca33c3689176747cf56509c9222c21fe152bc36f1a8a13",
  representations: Object.freeze([
    Object.freeze({
      lineEndings: "LF",
      migrationChecksum:
        "19a8429b33e6eb2fe513e00926a6a2187a76c45264ca35b88e863b904149456b",
      statementChecksum:
        "8a1fe184711a2271c1ca33c3689176747cf56509c9222c21fe152bc36f1a8a13",
    }),
    Object.freeze({
      lineEndings: "CRLF",
      migrationChecksum:
        "efebbb1ad193d5a110e152a99565867504f88aa313413226237a957ce4e7d7e3",
      statementChecksum:
        "7c262ffd6e8e3846a9038c8d159cbdabefe22555f77e79d2141d717b0bc8c2d4",
    }),
  ]),
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

  const statementChecksum = createHash("sha256")
    .update(statement, "utf8").digest("hex");
  const verifiedRepresentation = legacy.representations.some((representation) =>
    migration.checksum === representation.migrationChecksum &&
    statementChecksum === representation.statementChecksum,
  );
  if (migration.version !== legacy.version || !verifiedRepresentation) {
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
