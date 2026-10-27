import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(
    process.cwd(),
    "infra",
    "database",
    "migrations",
    "0010_estimate_document_lifecycle_and_policy.sql",
  ),
  "utf8",
);

describe("estimate lifecycle and proposal policy migration", () => {
  it("preserves existing estimates as legacy and defaults new proposals to policy v2", () => {
    expect(migration).toContain(
      "add column proposal_policy_version smallint not null default 1",
    );
    expect(migration).toContain(
      "alter column proposal_policy_version set default 2",
    );
    expect(migration).toContain("proposal_policy_version_is_immutable");
  });

  it("stores a required immutable lifecycle snapshot for new documents", () => {
    expect(migration).toContain("add column generated_as text");
    expect(migration).toContain("generated_as in ('draft', 'issued')");
    expect(migration).toContain("estimate_document_generated_as_is_required");
    expect(migration).toContain("estimate_document_generated_as_is_immutable");
  });

  it("allows only an isolated one-way classification of verified legacy rows", () => {
    expect(migration).toContain("old.generated_as is not null");
    expect(migration).toContain("legacy_document_classification_must_be_isolated");
    expect(migration).not.toMatch(/update\s+app\.estimate_documents\s+set\s+generated_as/i);
  });
});
