import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "infra",
    "database",
    "migrations",
    "0002_estimate_phase_1.sql",
  ),
  "utf8",
);

const tenantTables = [
  "customers",
  "projects",
  "estimates",
  "estimate_scope_items",
  "estimate_pricing_lines",
  "estimate_terms",
  "estimate_addenda",
  "audit_events",
  "estimate_command_idempotency",
];

describe("Aurora estimate Phase 1 migration", () => {
  it.each(tenantTables)("includes %s in the forced-RLS table set", (table) => {
    expect(migration).toContain(`'${table}'`);
  });

  it("enables and forces RLS with transaction-local organization context", () => {
    expect(migration).toContain(
      "alter table app.%I enable row level security",
    );
    expect(migration).toContain(
      "alter table app.%I force row level security",
    );
    expect(migration).toContain(
      "organization_id = app_private.current_organization_id()",
    );
    expect(migration).toContain(
      "current_setting('app.organization_id', true)",
    );
  });

  it("uses a restricted non-owner runtime role", () => {
    expect(migration).not.toContain("alter role perfect_shade_app_runtime");
    expect(migration).toContain(
      "revoke delete on all tables in schema app from perfect_shade_app_runtime",
    );
    expect(migration).toContain(
      "revoke create on schema app, app_private from perfect_shade_app_runtime",
    );
  });

  it("resolves active membership from the Cognito subject", () => {
    expect(migration).toContain(
      "function app_private.establish_estimate_context(caller_subject text)",
    );
    expect(migration).toContain("m.user_id = caller_subject");
    expect(migration).toContain("m.status::text = 'active'");
    expect(migration).toContain("if membership_count <> 1");
  });

  it("rejects cross-organization parent and revision relationships", () => {
    expect(migration).toContain(
      "foreign key (organization_id, customer_id)",
    );
    expect(migration).toContain(
      "foreign key (organization_id, project_id)",
    );
    expect(migration).toContain(
      "foreign key (organization_id, source_estimate_id)",
    );
    expect(
      migration.match(/foreign key \(organization_id, estimate_id\)/g),
    ).toHaveLength(5);
  });

  it("enforces soft-delete roles, issued immutability, and append-only audit", () => {
    expect(migration).toContain("soft_delete_requires_owner_or_admin");
    expect(migration).toContain("issued_estimate_is_immutable");
    expect(migration).toContain("audit_events_are_append_only");
    expect(migration).not.toMatch(
      /grant [^;]*delete[^;]*perfect_shade_app_runtime/i,
    );
  });

  it("preserves exact financial constraints and linked revision fields", () => {
    expect(migration).toContain("subtotal_minor bigint");
    expect(migration).toContain("deposit_percent numeric");
    expect(migration).toContain(
      "round(total_minor::numeric * deposit_percent / 100)::bigint",
    );
    expect(migration).toContain("source_estimate_id uuid");
    expect(migration).toContain("revision_number integer");
    expect(migration).toContain("row_version bigint");
  });
});
