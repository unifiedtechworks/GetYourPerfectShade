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

const staffManagementMigration = readFileSync(
  join(
    process.cwd(),
    "infra",
    "database",
    "migrations",
    "0004_staff_account_management.sql",
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

describe("Aurora staff account management migration", () => {
  it("exposes only task-specific staff commands to the runtime role", () => {
    expect(staffManagementMigration).toContain(
      "function app_private.create_staff_membership",
    );
    expect(staffManagementMigration).toContain(
      "function app_private.update_staff_membership_role",
    );
    expect(staffManagementMigration).toContain(
      "function app_private.update_staff_membership_status",
    );
    expect(staffManagementMigration).toContain(
      "revoke insert, update, delete on app.profiles, app.organization_memberships",
    );
  });

  it("prevents owner and self mutation while retaining the last-owner check", () => {
    expect(staffManagementMigration).toContain("self_action_forbidden");
    expect(staffManagementMigration).toContain("last_owner_protected");
    expect(staffManagementMigration).toContain("owner_protected");
    expect(staffManagementMigration).toContain("target_role not in ('admin', 'staff')");
  });

  it("uses soft membership states, organization predicates, and append-only audit events", () => {
    expect(staffManagementMigration).toContain(
      "m.organization_id = resolved_organization_id",
    );
    expect(staffManagementMigration).toContain(
      "insert into app.audit_events",
    );
    for (const action of [
      "membership.invited",
      "membership.role_changed",
      "membership.disabled",
      "membership.enabled",
      "membership.removed",
      "profile.display_name_updated",
    ]) {
      expect(staffManagementMigration).toContain(action);
    }
    expect(staffManagementMigration).not.toContain("delete from app.organization_memberships");
  });

  it("serializes invitation linkage and constrains normalized staff email", () => {
    expect(staffManagementMigration).toContain("pg_advisory_xact_lock");
    expect(staffManagementMigration).toContain("profiles_normalized_email_idx");
    expect(staffManagementMigration).toContain("already_complete");
  });
});
