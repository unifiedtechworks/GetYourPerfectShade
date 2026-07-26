import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "202607260002_estimate_phase_1.sql",
  ),
  "utf8",
);

const operationalTables = [
  "customers",
  "projects",
  "estimates",
  "estimate_scope_items",
  "estimate_pricing_lines",
  "estimate_terms",
  "estimate_addenda",
];

describe("estimate Phase 1 migration", () => {
  it.each(operationalTables)("enables RLS for %s", (table) => {
    expect(migration).toContain(
      `alter table public.${table} enable row level security;`,
    );
  });

  it.each(operationalTables)("revokes anonymous grants for %s", (table) => {
    expect(migration).toContain(`revoke all on table public.${table} from anon;`);
  });

  it("scopes member CRUD policies to active organization membership", () => {
    expect(migration.match(/is_organization_member\(organization_id\)/g)).toHaveLength(
      28,
    );
  });

  it("restricts operational record deletion to owners and admins", () => {
    expect(
      migration.match(
        /array\['owner', 'admin'\]::public\.organization_role\[\]/g,
      ),
    ).toHaveLength(7);
  });

  it("rejects cross-organization parent and source relationships", () => {
    expect(migration).toContain(
      "foreign key (organization_id, customer_id)",
    );
    expect(migration).toContain("foreign key (organization_id, project_id)");
    expect(migration).toContain(
      "foreign key (organization_id, source_estimate_id)",
    );
    expect(
      migration.match(/foreign key \(organization_id, estimate_id\)/g),
    ).toHaveLength(4);
  });

  it("prevents moving existing rows between organizations", () => {
    expect(migration).toContain(
      "create or replace function public.prevent_organization_id_change()",
    );
    expect(
      migration.match(/prevent_organization_id_change\(\)/g),
    ).toHaveLength(8);
  });

  it("keeps the atomic create function under caller RLS", () => {
    const functionDefinition = migration.slice(
      migration.indexOf(
        "create or replace function public.create_estimate_draft",
      ),
    );
    expect(functionDefinition).not.toContain("security definer");
    expect(functionDefinition).toContain(
      "not public.is_organization_member(target_organization_id)",
    );
  });
});
