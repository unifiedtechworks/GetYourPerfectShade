import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "infra",
    "database",
    "migrations",
    "0001_account_foundation.sql",
  ),
  "utf8",
);

describe("Aurora account foundation migration", () => {
  it("stores Cognito subjects as text and permits one active membership", () => {
    expect(migration).toContain("user_id text not null");
    expect(migration).toContain("organization_memberships_one_active_user_idx");
    expect(migration).toContain("where status = 'active'");
  });

  it("defines the organization and membership contract used by both APIs", () => {
    expect(migration).toContain("create table app.organizations");
    expect(migration).toContain("create table app.organization_memberships");
    expect(migration).toContain(
      "function app_private.establish_account_context(caller_subject text)",
    );
  });

  it("forces RLS and constrains the runtime role", () => {
    expect(migration.match(/force row level security/g)).toHaveLength(3);
    expect(migration).toContain("nobypassrls");
    expect(migration).toContain(
      "revoke insert, update, delete on app.profiles, app.organizations",
    );
    expect(migration).toContain(
      "grant perfect_shade_app_runtime to %I",
    );
  });
});
