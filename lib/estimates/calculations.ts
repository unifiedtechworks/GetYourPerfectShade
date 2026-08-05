export type DecimalValue = Readonly<{
  coefficient: bigint;
  scale: number;
}>;

export type EstimateTotals = Readonly<{
  subtotalMinor: bigint;
  salesTaxMinor: bigint;
  totalMinor: bigint;
  requiredDepositMinor: bigint;
  remainingBalanceMinor: bigint;
}>;

const DECIMAL_PATTERN =
  /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/;

function powerOfTen(exponent: number): bigint {
  if (!Number.isSafeInteger(exponent) || exponent < 0) {
    throw new RangeError("Decimal scale is outside the supported range.");
  }
  return 10n ** BigInt(exponent);
}

function normalizeDecimal(coefficient: bigint, scale: number): DecimalValue {
  if (coefficient === 0n) return { coefficient: 0n, scale: 0 };
  let normalizedCoefficient = coefficient;
  let normalizedScale = scale;
  while (normalizedScale > 0 && normalizedCoefficient % 10n === 0n) {
    normalizedCoefficient /= 10n;
    normalizedScale -= 1;
  }
  return { coefficient: normalizedCoefficient, scale: normalizedScale };
}

export function parseDecimal(value: string, fieldName: string): DecimalValue {
  const cleaned = value.trim();
  const match = DECIMAL_PATTERN.exec(cleaned);
  if (!match) throw new Error(`${fieldName} must be a valid number.`);

  const sign = match[1] === "-" ? -1n : 1n;
  const integerDigits = match[2] ?? "0";
  const fractionDigits = match[3] ?? match[4] ?? "";
  const exponent = Number(match[5] ?? "0");
  if (
    !Number.isSafeInteger(exponent) ||
    Math.abs(exponent) > 100 ||
    fractionDigits.length > 100
  ) {
    throw new Error(`${fieldName} must be a valid number.`);
  }

  const digits = `${integerDigits}${fractionDigits}`.replace(/^0+(?=\d)/, "");
  let coefficient = sign * BigInt(digits);
  let scale = fractionDigits.length - exponent;
  if (scale < 0) {
    coefficient *= powerOfTen(-scale);
    scale = 0;
  }
  return normalizeDecimal(coefficient, scale);
}

export function parsePercent(value: string, fieldName: string): DecimalValue {
  const cleaned = value.trim().replaceAll("%", "") || "0";
  return parseDecimal(cleaned, fieldName);
}

export function compareDecimal(left: DecimalValue, right: DecimalValue): number {
  const scale = Math.max(left.scale, right.scale);
  const leftValue = left.coefficient * powerOfTen(scale - left.scale);
  const rightValue = right.coefficient * powerOfTen(scale - right.scale);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

export function decimalToString(value: DecimalValue): string {
  if (value.scale === 0) return value.coefficient.toString();
  const negative = value.coefficient < 0n;
  const digits = (negative ? -value.coefficient : value.coefficient)
    .toString()
    .padStart(value.scale + 1, "0");
  const split = digits.length - value.scale;
  return `${negative ? "-" : ""}${digits.slice(0, split)}.${digits.slice(split)}`;
}

export function parseMoneyToMinorUnits(value: string): bigint {
  const cleaned = value.trim().replaceAll("$", "").replaceAll(",", "");
  if (!cleaned) throw new Error("Amount is required.");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Invalid amount: ${value}`);
  }

  const negative = cleaned.startsWith("-");
  const unsigned = negative ? cleaned.slice(1) : cleaned;
  const [dollars, fraction = ""] = unsigned.split(".");
  const minor = BigInt(dollars) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -minor : minor;
}

function divideRoundHalfAwayFromZero(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError("Denominator must be positive.");
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = absolute / denominator;
  const remainder = absolute % denominator;
  const rounded = remainder * 2n >= denominator ? quotient + 1n : quotient;
  return negative ? -rounded : rounded;
}

export function applyPercentToMinorUnits(
  amountMinor: bigint,
  percent: DecimalValue,
): bigint {
  const denominator = 100n * powerOfTen(percent.scale);
  return divideRoundHalfAwayFromZero(
    amountMinor * percent.coefficient,
    denominator,
  );
}

export function calculateEstimateTotals(
  pricingAmountsMinor: readonly bigint[],
  depositPercent: DecimalValue,
): EstimateTotals {
  const subtotalMinor = pricingAmountsMinor.reduce(
    (sum, amount) => sum + amount,
    0n,
  );
  const salesTaxMinor = 0n;
  const totalMinor = subtotalMinor;
  const requiredDepositMinor = applyPercentToMinorUnits(
    totalMinor,
    depositPercent,
  );
  return {
    subtotalMinor,
    salesTaxMinor,
    totalMinor,
    requiredDepositMinor,
    remainingBalanceMinor: totalMinor - requiredDepositMinor,
  };
}

export function formatCurrencyFromMinorUnits(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const dollars = absolute / 100n;
  const cents = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}$${dollars.toLocaleString("en-US")}.${cents}`;
}

export function formatMoneyInputFromMinorUnits(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const dollars = absolute / 100n;
  const cents = (absolute % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${dollars}.${cents}`;
}
