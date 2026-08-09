import { describe, expect, it } from "vitest";
import {
  canAddEditorRow,
  initializePricingEditorRows,
  initializeScopeEditorRows,
  initializeTextEditorRows,
  moveTextEditorRow,
  removePricingEditorRow,
  removeScopeEditorRow,
  removeTextEditorRow,
  showAlternatePricing,
} from "./editor-state";

describe("estimate editor UX state", () => {
  it("starts new scope and base-pricing editors with exactly one row", () => {
    expect(initializeScopeEditorRows([])).toHaveLength(1);
    expect(initializePricingEditorRows([], "base")).toHaveLength(1);
  });

  it("hides disabled alternates and reveals exactly one initial row when enabled", () => {
    const rows = initializePricingEditorRows([], "alternate");

    expect(showAlternatePricing(false)).toBe(false);
    expect(rows).toHaveLength(1);
    expect(showAlternatePricing(true)).toBe(true);
  });

  it("preserves alternate rows across disable and re-enable", () => {
    const rows = initializePricingEditorRows(
      [{ key: "alternate-1", description: "Motorized", amount: "250" }],
      "alternate",
    );

    expect(showAlternatePricing(false)).toBe(false);
    expect(showAlternatePricing(true)).toBe(true);
    expect(rows).toEqual([
      { key: "alternate-1", description: "Motorized", amount: "250" },
    ]);
  });

  it("loads every saved row without padding or truncating multi-row estimates", () => {
    const scopeRows = [
      { key: "scope-1", description: "Measure" },
      { key: "scope-2", description: "Install" },
    ];
    const pricingRows = [
      { key: "base-1", description: "Shades", amount: "100" },
      { key: "base-2", description: "Controls", amount: "50" },
    ];

    expect(initializeScopeEditorRows(scopeRows)).toEqual(scopeRows);
    expect(initializePricingEditorRows(pricingRows, "base")).toEqual(
      pricingRows,
    );
  });

  it("never removes the final editable row", () => {
    expect(
      removeScopeEditorRow(
        [{ key: "scope-1", description: "Measure" }],
        0,
      ),
    ).toEqual([{ key: "scope-1", description: "" }]);
    expect(
      removePricingEditorRow(
        [{ key: "base-1", description: "Shades", amount: "100" }],
        0,
        "base",
      ),
    ).toEqual([{ key: "base-1", description: "", amount: "" }]);
  });

  it("allows additions below a row cap and refuses additions at the cap", () => {
    expect(canAddEditorRow(19, 20)).toBe(true);
    expect(canAddEditorRow(20, 20)).toBe(false);
    expect(canAddEditorRow(49, 50)).toBe(true);
    expect(canAddEditorRow(50, 50)).toBe(false);
  });

  it("starts terms and addenda with one row, preserves saved rows, and retains a final editor row", () => {
    expect(initializeTextEditorRows([], "term")).toHaveLength(1);
    expect(initializeTextEditorRows([], "addendum")).toHaveLength(1);
    const saved = [
      { key: "term-1", description: "First" },
      { key: "term-2", description: "Second\nline" },
    ];
    expect(initializeTextEditorRows(saved, "term")).toEqual(saved);
    expect(removeTextEditorRow([saved[0]], 0, "term")).toEqual([
      { key: "term-1", description: "" },
    ]);
  });

  it("reorders text rows without losing multiline content", () => {
    const rows = [
      { key: "1", description: "First\nline" },
      { key: "2", description: "Second" },
      { key: "3", description: "Third" },
    ];
    expect(moveTextEditorRow(rows, 1, -1)).toEqual([rows[1], rows[0], rows[2]]);
    expect(moveTextEditorRow(rows, 1, 1)).toEqual([rows[0], rows[2], rows[1]]);
    expect(moveTextEditorRow(rows, 0, -1)).toEqual(rows);
  });
});
