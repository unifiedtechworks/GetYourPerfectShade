import type {
  DocumentType,
  UpdateEstimateDraftRequest,
} from "../aws/api/estimate-contracts";
import {
  calculateEstimateTotals,
  compareDecimal,
  decimalToString,
  parseDecimal,
  parseMoneyToMinorUnits,
  parsePercent,
} from "./calculations";

export const DEFAULT_SCOPE_ROWS = 3;
export const DEFAULT_PRICING_ROWS = 3;
export const DEFAULT_ALTERNATE_PRICING_ROWS = 1;
export const MAX_SCOPE_ITEMS = 20;
export const MAX_PRICING_LINES = 50;
export const MAX_ALTERNATE_PRICING_LINES = 20;

const BIGINT_MIN = -(2n ** 63n);
const BIGINT_MAX = 2n ** 63n - 1n;
const DOCUMENT_TYPES = new Set<DocumentType>(["Bid Proposal", "Estimate"]);

export type EstimateEditorTextRow = Readonly<{
  key: string;
  description: string;
}>;

export type EstimateEditorPricingRow = Readonly<{
  key: string;
  description: string;
  amount: string;
}>;

export type EstimateEditorForm = Readonly<{
  expectedRowVersion: string;
  documentType: string;
  estimateNumber: string;
  estimateDate: string;
  validThrough: string;
  bidDue: string;
  projectName: string;
  projectLocation: string;
  preparedFor: string;
  contactInformation: string;
  depositPercent: string;
  includeAlternatePricing: boolean;
  scopeItems: readonly EstimateEditorTextRow[];
  pricingLines: readonly EstimateEditorPricingRow[];
  alternatePricingLines: readonly EstimateEditorPricingRow[];
}>;

export type EstimateEditorTotals = Readonly<{
  subtotalMinor: bigint;
  salesTaxMinor: bigint;
  totalMinor: bigint;
  requiredDepositMinor: bigint;
  remainingBalanceMinor: bigint;
  alternateTotalMinor: bigint;
}>;

export type EstimateEditorValidation = Readonly<{
  request: UpdateEstimateDraftRequest | null;
  totals: EstimateEditorTotals;
  fields: Readonly<Record<string, string>>;
}>;

function inBigintRange(value: bigint): boolean {
  return value >= BIGINT_MIN && value <= BIGINT_MAX;
}

function trim(value: string): string {
  return value.trim();
}

function parsePricingRows(
  rows: readonly EstimateEditorPricingRow[],
  fieldPrefix: "pricingLines" | "alternatePricingLines",
  requireAtLeastOne: boolean,
  maximum: number,
  fields: Record<string, string>,
): readonly Readonly<{ description: string; amountMinor: string }>[] {
  if (rows.length > maximum) {
    fields[fieldPrefix] = `Supports up to ${maximum} lines.`;
  }

  const parsed: { description: string; amountMinor: string }[] = [];
  rows.slice(0, maximum).forEach((row, index) => {
    const description = trim(row.description);
    const amount = trim(row.amount);
    if (!description && !amount) return;
    if (!amount) {
      if (fieldPrefix === "alternatePricingLines" && !requireAtLeastOne) return;
      fields[`${fieldPrefix}.${index}.amount`] = `${
        fieldPrefix === "pricingLines" ? "Pricing" : "Alternate pricing"
      } line ${index + 1} needs an amount.`;
      return;
    }
    try {
      const amountMinor = parseMoneyToMinorUnits(amount);
      if (!inBigintRange(amountMinor)) {
        fields[`${fieldPrefix}.${index}.amount`] =
          "Amount is outside the supported range.";
        return;
      }
      parsed.push({ description, amountMinor: amountMinor.toString() });
    } catch (error) {
      fields[`${fieldPrefix}.${index}.amount`] =
        error instanceof Error ? error.message : "Enter a valid amount.";
    }
  });

  if (requireAtLeastOne && parsed.length === 0) {
    fields[fieldPrefix] =
      fieldPrefix === "pricingLines"
        ? "At least one pricing line with a valid amount is required."
        : "Include Alternate Pricing is checked, but no valid alternate pricing rows were entered.";
  }
  return parsed;
}

function sumMinorUnits(values: readonly string[]): bigint {
  return values.reduce((sum, value) => sum + BigInt(value), 0n);
}

export function validateEstimateEditor(
  form: EstimateEditorForm,
): EstimateEditorValidation {
  const fields: Record<string, string> = {};
  const documentType = trim(form.documentType);
  if (!DOCUMENT_TYPES.has(documentType as DocumentType)) {
    fields.documentType = "Choose Bid Proposal or Estimate.";
  }
  if (!trim(form.projectName)) fields.projectName = "Project Name is required.";
  if (!trim(form.preparedFor)) fields.preparedFor = "Architect is required.";
  if (!/^[1-9]\d*$/.test(form.expectedRowVersion)) {
    fields.expectedRowVersion = "Reload the draft before saving.";
  }
  if (form.scopeItems.length > MAX_SCOPE_ITEMS) {
    fields.scopeItems = `Scope of work supports up to ${MAX_SCOPE_ITEMS} items.`;
  }

  const scopeItems = form.scopeItems
    .slice(0, MAX_SCOPE_ITEMS)
    .map((row) => ({ description: trim(row.description) }))
    .filter((row) => row.description);
  const pricingLines = parsePricingRows(
    form.pricingLines,
    "pricingLines",
    true,
    MAX_PRICING_LINES,
    fields,
  );
  const alternatePricingLines = parsePricingRows(
    form.alternatePricingLines,
    "alternatePricingLines",
    form.includeAlternatePricing,
    MAX_ALTERNATE_PRICING_LINES,
    fields,
  );

  let depositPercent = parseDecimal("0", "Deposit %");
  try {
    depositPercent = parsePercent(form.depositPercent, "Deposit %");
    if (
      compareDecimal(depositPercent, parseDecimal("0", "Deposit %")) < 0 ||
      compareDecimal(depositPercent, parseDecimal("100", "Deposit %")) > 0
    ) {
      fields.depositPercent = "Deposit % must be between 0 and 100.";
    }
  } catch (error) {
    fields.depositPercent =
      error instanceof Error ? error.message : "Deposit % must be valid.";
  }

  const baseAmounts = pricingLines.map((line) => BigInt(line.amountMinor));
  const baseTotals = calculateEstimateTotals(baseAmounts, depositPercent);
  const alternateTotalMinor = sumMinorUnits(
    alternatePricingLines.map((line) => line.amountMinor),
  );
  const totals = { ...baseTotals, alternateTotalMinor };
  if (
    ![
      totals.subtotalMinor,
      totals.totalMinor,
      totals.requiredDepositMinor,
      totals.remainingBalanceMinor,
      totals.alternateTotalMinor,
    ].every(inBigintRange)
  ) {
    fields.pricingLines = "Calculated totals are outside the supported range.";
  }

  return {
    totals,
    fields,
    request:
      Object.keys(fields).length === 0
        ? {
            expectedRowVersion: form.expectedRowVersion,
            documentType: documentType as DocumentType,
            estimateNumber: trim(form.estimateNumber),
            estimateDate: trim(form.estimateDate),
            validThrough: trim(form.validThrough),
            bidDue: trim(form.bidDue),
            projectName: trim(form.projectName),
            projectLocation: trim(form.projectLocation),
            preparedFor: trim(form.preparedFor),
            contactInformation: trim(form.contactInformation),
            depositPercent: decimalToString(depositPercent),
            includeAlternatePricing: form.includeAlternatePricing,
            scopeItems,
            pricingLines,
            alternatePricingLines,
          }
        : null,
  };
}
