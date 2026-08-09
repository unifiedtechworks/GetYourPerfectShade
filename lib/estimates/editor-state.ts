import {
  DEFAULT_ALTERNATE_PRICING_ROWS,
  DEFAULT_PRICING_ROWS,
  DEFAULT_SCOPE_ROWS,
  type EstimateEditorPricingRow,
  type EstimateEditorTextRow,
} from "./editor";

export function initializeScopeEditorRows(
  rows: readonly EstimateEditorTextRow[],
): EstimateEditorTextRow[] {
  const result = [...rows];
  while (result.length < DEFAULT_SCOPE_ROWS) {
    result.push({ key: `scope-blank-${result.length}`, description: "" });
  }
  return result;
}

export function initializePricingEditorRows(
  rows: readonly EstimateEditorPricingRow[],
  kind: "base" | "alternate",
): EstimateEditorPricingRow[] {
  const minimum =
    kind === "base" ? DEFAULT_PRICING_ROWS : DEFAULT_ALTERNATE_PRICING_ROWS;
  const result = [...rows];
  while (result.length < minimum) {
    result.push({
      key: `${kind}-blank-${result.length}`,
      description: "",
      amount: "",
    });
  }
  return result;
}

export function removeScopeEditorRow(
  rows: readonly EstimateEditorTextRow[],
  index: number,
): EstimateEditorTextRow[] {
  if (rows.length <= 1) {
    const row = rows[0] ?? { key: "scope-blank-0", description: "" };
    return [{ ...row, description: "" }];
  }
  return rows.filter((_, rowIndex) => rowIndex !== index);
}

export function removePricingEditorRow(
  rows: readonly EstimateEditorPricingRow[],
  index: number,
  kind: "base" | "alternate",
): EstimateEditorPricingRow[] {
  if (rows.length <= 1) {
    const row = rows[0] ?? {
      key: `${kind}-blank-0`,
      description: "",
      amount: "",
    };
    return [{ ...row, description: "", amount: "" }];
  }
  return rows.filter((_, rowIndex) => rowIndex !== index);
}

export function showAlternatePricing(includeAlternatePricing: boolean): boolean {
  return includeAlternatePricing;
}

export function canAddEditorRow(
  currentRowCount: number,
  maximumRowCount: number,
): boolean {
  return currentRowCount < maximumRowCount;
}
