import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("estimate editor row controls", () => {
  it("gives repeated row actions contextual accessible names", () => {
    const source = readFileSync(
      join(
        process.cwd(),
        "app",
        "app",
        "estimates",
        "[estimateId]",
        "EstimateEditor.tsx",
      ),
      "utf8",
    );

    for (const label of [
      "Remove scope item",
      "Remove pricing line",
      "Remove alternate pricing line",
      "Move addendum",
      "Remove addendum",
      "Move term or exclusion",
      "Remove term or exclusion",
    ]) {
      expect(source).toContain(`aria-label={\`${label}`);
    }
  });
});
