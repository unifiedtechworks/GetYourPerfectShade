import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "infra",
    "database",
    "migrations",
    "0005_estimate_phase_2.sql",
  ),
  "utf8",
);

describe("Aurora estimate Phase 2 migration", () => {
  it("keeps direct delete unavailable to the Lambda runtime role", () => {
    expect(migration).not.toMatch(
      /grant\s+delete\s+on[\s\S]*perfect_shade_app_runtime/i,
    );
    expect(migration).toContain(
      "grant execute on function app_private.replace_estimate_phase_2_rows",
    );
  });

  it("allows controlled deletion only for the resolved tenant's draft", () => {
    expect(migration.match(/create policy tenant_delete_draft_child/g)).toHaveLength(
      2,
    );
    expect(migration).toContain(
      "organization_id = app_private.current_organization_id()",
    );
    expect(migration).toContain("and e.status = 'draft'");
    expect(migration).toContain("and e.deleted_at is null");
  });

  it("uses a constrained security-definer function and server context", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("app_private.current_organization_id()");
    expect(migration).toContain("app_private.current_actor_id()");
    expect(migration).not.toContain("caller_organization_id");
    expect(migration).not.toContain("caller_actor_id");
  });

  it("enforces row caps and preserves array order on replacement", () => {
    expect(migration).toContain("jsonb_array_length(scope_items) > 20");
    expect(migration).toContain("jsonb_array_length(pricing_lines) > 50");
    expect(migration).toContain("jsonb_array_length(alternate_pricing_lines) > 20");
    expect(migration.match(/with ordinality/g)).toHaveLength(3);
    expect(migration).toContain("item.ordinality - 1");
  });

  it("replaces scope, base, and alternate rows in one transaction-owned call", () => {
    expect(migration).toContain("delete from app.estimate_scope_items");
    expect(migration).toContain("delete from app.estimate_pricing_lines");
    expect(migration).toContain("insert into app.estimate_scope_items");
    expect(migration.match(/insert into app\.estimate_pricing_lines/g)).toHaveLength(
      2,
    );
    expect(migration).toContain("'base'");
    expect(migration).toContain("'alternate'");
    expect(migration).toContain("e.subtotal_minor <>");
    expect(migration).toContain("coalesce(sum(line.amount_minor), 0)::bigint");
    expect(migration).toContain("enabled_alternate_pricing_requires_a_line");
  });
});
