import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const directory = join(process.cwd(), "infra", "database", "migrations");
const migration = readFileSync(join(directory, "0007_estimate_phase_4.sql"), "utf8");

describe("Aurora estimate Phase 4 migration", () => {
  it("is the unique next migration in deterministic order", () => {
    expect(readdirSync(directory).filter((name) => name.endsWith(".sql")).sort()).toEqual([
      "0001_account_foundation.sql",
      "0002_estimate_phase_1.sql",
      "0003_initial_owner_bootstrap.sql",
      "0004_staff_account_management.sql",
      "0005_estimate_phase_2.sql",
      "0006_estimate_phase_3.sql",
      "0007_estimate_phase_4.sql",
    ]);
  });

  it("tracks issued identity, immutable lineage, and unique next revisions", () => {
    expect(migration).toContain("add column issued_by text");
    expect(migration).toContain("estimates_issued_by_required");
    expect(migration).toContain("estimates_source_revision_unique");
    expect(migration).toContain("estimate_lineage_is_immutable");
  });

  it("adds recoverable tenant-owned document history without delete access", () => {
    expect(migration).toContain("create table app.estimate_documents");
    expect(migration).toContain("state in ('pending', 'ready', 'failed')");
    expect(migration).toContain("checksum_sha256");
    expect(migration).toContain("object_version_id");
    expect(migration).toContain("rendered_at timestamptz not null");
    expect(migration).toContain("alter table app.estimate_documents force row level security");
    expect(migration).toContain("organization_id = app_private.current_organization_id()");
    expect(migration).toContain("revoke delete on app.estimate_documents from perfect_shade_app_runtime");
    expect(migration).not.toMatch(/grant\s+delete\s+on[\s\S]*perfect_shade_app_runtime/i);
  });

  it("closes child insertion after issue without weakening existing policies", () => {
    expect(migration.match(/create policy issued_parent_insert_guard/g)).toHaveLength(4);
    expect(migration.match(/on app\.estimate_(?:scope_items|pricing_lines|terms|addenda) as restrictive/g)).toHaveLength(4);
    expect(migration.match(/and e\.status = 'draft'/g)).toHaveLength(4);
  });

  it("allows only pending document rows to transition once", () => {
    expect(migration).toContain("if old.state <> 'pending' or new.state not in ('ready', 'failed')");
    expect(migration).toContain("estimate_document_history_is_immutable");
    expect(migration).toContain("create policy tenant_update_pending");
  });
});
