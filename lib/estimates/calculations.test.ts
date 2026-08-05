import { describe, expect, it } from "vitest";
import {
  applyPercentToMinorUnits,
  calculateEstimateTotals,
  compareDecimal,
  decimalToString,
  formatCurrencyFromMinorUnits,
  formatMoneyInputFromMinorUnits,
  parseDecimal,
  parseMoneyToMinorUnits,
  parsePercent,
} from "./calculations";

describe("parseMoneyToMinorUnits", () => {
  it.each([
    ["1000", 100000n],
    ["1000.50", 100050n],
    ["$1,000.50", 100050n],
    ["-2.5", -250n],
  ])("parses desktop-supported money %s", (value, expected) => {
    expect(parseMoneyToMinorUnits(value)).toBe(expected);
  });

  it.each(["", "one thousand", "12.345", "$1,2x0.00"])(
    "rejects invalid money %s",
    (value) => expect(() => parseMoneyToMinorUnits(value)).toThrow(),
  );
});

describe("decimal percentages", () => {
  it.each([
    ["", "0"],
    ["50%", "50"],
    [".5", "0.5"],
    ["1.25e1", "12.5"],
  ])("parses %s exactly", (value, expected) => {
    expect(decimalToString(parsePercent(value, "Deposit %"))).toBe(expected);
  });

  it("compares exact decimal values without floating point", () => {
    expect(
      compareDecimal(
        parseDecimal("99.999", "value"),
        parseDecimal("100", "value"),
      ),
    ).toBe(-1);
  });

  it("rejects impractical exponents before allocating enormous integers", () => {
    expect(() => parsePercent("1e999999", "Deposit %")).toThrow(
      "Deposit % must be a valid number.",
    );
  });
});

describe("calculateEstimateTotals", () => {
  it("preserves the desktop rule that sales tax is outside proposal totals", () => {
    expect(
      calculateEstimateTotals(
        [100000n, 25050n],
        parsePercent("20", "Deposit %"),
      ),
    ).toEqual({
      subtotalMinor: 125050n,
      salesTaxMinor: 0n,
      totalMinor: 125050n,
      requiredDepositMinor: 25010n,
      remainingBalanceMinor: 100040n,
    });
  });

  it("rounds a half-cent deposit away from zero like Decimal ROUND_HALF_UP", () => {
    const halfPercent = parsePercent("0.5", "Deposit %");
    expect(applyPercentToMinorUnits(100n, halfPercent)).toBe(1n);
    expect(applyPercentToMinorUnits(-100n, halfPercent)).toBe(-1n);
  });

  it("does not include alternate amounts supplied outside the base amount list", () => {
    const totals = calculateEstimateTotals(
      [100000n, 50000n],
      parsePercent("50", "Deposit %"),
    );
    expect(totals.totalMinor).toBe(150000n);
    expect(totals.requiredDepositMinor).toBe(75000n);
  });
});

describe("formatCurrencyFromMinorUnits", () => {
  it("formats bigint minor units without Number conversion", () => {
    expect(formatCurrencyFromMinorUnits(123456789012345n)).toBe(
      "$1,234,567,890,123.45",
    );
    expect(formatCurrencyFromMinorUnits(-250n)).toBe("-$2.50");
  });

  it("formats editable decimal text without grouping or currency symbols", () => {
    expect(formatMoneyInputFromMinorUnits(100050n)).toBe("1000.50");
    expect(formatMoneyInputFromMinorUnits(-250n)).toBe("-2.50");
  });
});
