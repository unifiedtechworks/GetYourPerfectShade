import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "infra", "database", "migrations", "0006_estimate_phase_3.sql"),
  "utf8",
);

describe("Aurora estimate Phase 3 migration", () => {
  it("keeps the forward-only migrations uniquely and deterministically ordered", () => {
    expect(
      readdirSync(join(process.cwd(), "infra", "database", "migrations"))
        .filter((name) => name.endsWith(".sql"))
        .sort(),
    ).toEqual([
      "0001_account_foundation.sql",
      "0002_estimate_phase_1.sql",
      "0003_initial_owner_bootstrap.sql",
      "0004_staff_account_management.sql",
      "0005_estimate_phase_2.sql",
      "0006_estimate_phase_3.sql",
      "0007_estimate_phase_4.sql",
    ]);
  });

  it("keeps direct delete unavailable to the Lambda runtime role", () => {
    expect(migration).not.toMatch(/grant\s+delete\s+on[\s\S]*perfect_shade_app_runtime/i);
    expect(migration).toContain(
      "grant execute on function app_private.replace_estimate_phase_3_content",
    );
  });

  it("allows controlled deletion only for the resolved tenant's draft", () => {
    expect(migration.match(/create policy tenant_delete_draft_child/g)).toHaveLength(2);
    expect(migration).toContain("organization_id = app_private.current_organization_id()");
    expect(migration).toContain("and e.status = 'draft'");
    expect(migration).toContain("and e.deleted_at is null");
  });

  it("uses a constrained security-definer function and authenticated context", () => {
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("app_private.current_organization_id()");
    expect(migration).toContain("app_private.current_actor_id()");
    expect(migration).not.toContain("caller_organization_id");
    expect(migration).not.toContain("caller_actor_id");
  });

  it("enforces the approved term cap and preserves row order", () => {
    expect(migration).toContain("jsonb_array_length(terms) > 20");
    expect(migration.match(/with ordinality/g)).toHaveLength(2);
    expect(migration).toContain("item.ordinality - 1");
  });

  it("replaces terms and addenda in one transaction-owned call", () => {
    expect(migration).toContain("delete from app.estimate_terms");
    expect(migration).toContain("delete from app.estimate_addenda");
    expect(migration).toContain("insert into app.estimate_terms");
    expect(migration).toContain("insert into app.estimate_addenda");
    expect(migration).toContain("editable_estimate_not_found");
  });
});
