import { describe, expect, it } from "vitest";
import {
  DEFAULT_ALTERNATE_PRICING_ROWS,
  DEFAULT_DEPOSIT_PERCENT,
  DEFAULT_PRICING_ROWS,
  DEFAULT_SCOPE_ROWS,
  MAX_ALTERNATE_PRICING_LINES,
  MAX_PRICING_LINES,
  MAX_SCOPE_ITEMS,
  type EstimateEditorForm,
  depositPercentForEditor,
  validateEstimateEditor,
} from "./editor";

function form(overrides: Partial<EstimateEditorForm> = {}): EstimateEditorForm {
  return {
    expectedRowVersion: "1",
    documentType: "Bid Proposal",
    estimateNumber: "B-100",
    estimateDate: "August 5, 2026",
    validThrough: "30 days",
    bidDue: "",
    projectName: "Atrium",
    projectLocation: "Portland",
    preparedFor: "Morgan Architect",
    contactInformation: "Owner",
    depositPercent: "20",
    includeAlternatePricing: false,
    includePrevailingWageStatement: false,
    prevailingWageStatement:
      "Applicable prevailing wage labor rates are included where required by the project.",
    leadTime: "",
    pricingValidDays: "",
    projectNotes: "",
    scopeItems: [
      { key: "scope-1", description: " Shades " },
      { key: "scope-2", description: "" },
    ],
    pricingLines: [
      { key: "base-1", description: "Base", amount: "$1,000.50" },
      { key: "base-2", description: "", amount: "" },
    ],
    alternatePricingLines: [
      { key: "alternate-1", description: "Motorized", amount: "250" },
    ],
    terms: [{ key: "term-1", description: "" }],
    addenda: [{ key: "addendum-1", description: "" }],
    ...overrides,
  };
}

describe("estimate editor approved behavior", () => {
  it("publishes the approved row defaults and caps", () => {
    expect({
      scopeDefault: DEFAULT_SCOPE_ROWS,
      pricingDefault: DEFAULT_PRICING_ROWS,
      alternateDefault: DEFAULT_ALTERNATE_PRICING_ROWS,
      scopeMax: MAX_SCOPE_ITEMS,
      pricingMax: MAX_PRICING_LINES,
      alternateMax: MAX_ALTERNATE_PRICING_LINES,
    }).toEqual({
      scopeDefault: 1,
      pricingDefault: 1,
      alternateDefault: 1,
      scopeMax: 20,
      pricingMax: 50,
      alternateMax: 20,
    });
  });

  it("defaults new drafts to a 50% deposit and preserves stored deposits", () => {
    expect(DEFAULT_DEPOSIT_PERCENT).toBe("50");
    expect(depositPercentForEditor()).toBe("50");
    expect(depositPercentForEditor("")).toBe("50");
    expect(depositPercentForEditor("0")).toBe("0");
    expect(depositPercentForEditor("12.5")).toBe("12.5");
  });

  it("omits blank rows and preserves the remaining order", () => {
    const result = validateEstimateEditor(
      form({
        scopeItems: [
          { key: "1", description: "First" },
          { key: "2", description: "  " },
          { key: "3", description: "Third" },
        ],
        pricingLines: [
          { key: "1", description: "First", amount: "1" },
          { key: "2", description: "", amount: "" },
          { key: "3", description: "Third", amount: "3" },
        ],
      }),
    );
    expect(result.request?.scopeItems).toEqual([
      { description: "First" },
      { description: "Third" },
    ]);
    expect(result.request?.pricingLines).toEqual([
      { description: "First", amountMinor: "100" },
      { description: "Third", amountMinor: "300" },
    ]);
  });

  it("calculates half-up deposit totals and excludes alternates", () => {
    const result = validateEstimateEditor(
      form({
        depositPercent: "0.5",
        includeAlternatePricing: true,
        pricingLines: [{ key: "base", description: "Base", amount: "1.00" }],
        alternatePricingLines: [
          { key: "alternate", description: "Option", amount: "500.25" },
        ],
      }),
    );
    expect(result.fields).toEqual({});
    expect(result.totals).toEqual({
      subtotalMinor: 100n,
      salesTaxMinor: 0n,
      totalMinor: 100n,
      requiredDepositMinor: 1n,
      remainingBalanceMinor: 99n,
      alternateTotalMinor: 50025n,
    });
  });

  it("keeps valid alternate rows while inclusion is disabled", () => {
    const result = validateEstimateEditor(form());
    expect(result.request?.includeAlternatePricing).toBe(false);
    expect(result.request?.alternatePricingLines).toEqual([
      { description: "Motorized", amountMinor: "25000" },
    ]);
    expect(result.totals.totalMinor).toBe(100050n);
    expect(result.totals.alternateTotalMinor).toBe(25000n);
  });

  it("ignores description-only alternates while inclusion is disabled", () => {
    const result = validateEstimateEditor(
      form({
        includeAlternatePricing: false,
        alternatePricingLines: [
          { key: "alternate", description: "Not yet priced", amount: "" },
        ],
      }),
    );
    expect(result.fields).toEqual({});
    expect(result.request?.alternatePricingLines).toEqual([]);
  });

  it("requires a base amount and a valid enabled alternate", () => {
    const result = validateEstimateEditor(
      form({
        includeAlternatePricing: true,
        pricingLines: [{ key: "base", description: "Description only", amount: "" }],
        alternatePricingLines: [
          { key: "alternate", description: "Description only", amount: "" },
        ],
      }),
    );
    expect(result.request).toBeNull();
    expect(result.fields["pricingLines.0.amount"]).toMatch(/needs an amount/);
    expect(result.fields.pricingLines).toMatch(/At least one pricing line/);
    expect(result.fields["alternatePricingLines.0.amount"]).toMatch(
      /needs an amount/,
    );
    expect(result.fields.alternatePricingLines).toMatch(
      /no valid alternate pricing rows/,
    );
  });

  it("rejects invalid money, percentages, stale versions, and row-cap overflow", () => {
    const result = validateEstimateEditor(
      form({
        expectedRowVersion: "0",
        depositPercent: "101",
        scopeItems: Array.from({ length: 21 }, (_, index) => ({
          key: String(index),
          description: "Scope",
        })),
        pricingLines: Array.from({ length: 51 }, (_, index) => ({
          key: String(index),
          description: "Price",
          amount: index === 0 ? "12.345" : "1",
        })),
        alternatePricingLines: Array.from({ length: 21 }, (_, index) => ({
          key: String(index),
          description: "Alternate",
          amount: "1",
        })),
      }),
    );
    expect(result.request).toBeNull();
    expect(result.fields.expectedRowVersion).toBeTruthy();
    expect(result.fields.depositPercent).toMatch(/between 0 and 100/);
    expect(result.fields.scopeItems).toMatch(/up to 20/);
    expect(result.fields.pricingLines).toMatch(/up to 50/);
    expect(result.fields.alternatePricingLines).toMatch(/up to 20/);
    expect(result.fields["pricingLines.0.amount"]).toBe("Invalid amount: 12.345");
  });

  it("suppresses blank text rows, preserves multiline order, and keeps custom prevailing wording while disabled", () => {
    const result = validateEstimateEditor(
      form({
        includePrevailingWageStatement: false,
        prevailingWageStatement: " Custom wording. ",
        terms: [
          { key: "1", description: " First\nline " },
          { key: "2", description: "  " },
          { key: "3", description: "Third" },
        ],
        addenda: [
          { key: "1", description: "Addendum 1" },
          { key: "2", description: "" },
        ],
      }),
    );
    expect(result.request).toMatchObject({
      includePrevailingWageStatement: false,
      prevailingWageStatement: "Custom wording.",
      terms: [
        { description: "First\nline" },
        { description: "Third" },
      ],
      addenda: [{ description: "Addendum 1" }],
    });
  });
});
