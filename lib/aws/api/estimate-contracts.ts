export const ESTIMATE_API_VERSION = "v1" as const;

export type EstimateStatus =
  | "draft"
  | "issued"
  | "accepted"
  | "declined"
  | "expired"
  | "void";

export type DocumentType = "Bid Proposal" | "Estimate";

export type CreateEstimateDraftRequest = Readonly<{
  customerName: string;
  projectName: string;
  projectLocation: string;
  preparedFor: string;
  contactInformation: string;
  documentType: DocumentType;
  estimateNumber: string;
  pricingDescription: string;
  pricingAmountMinor: string;
  depositPercent: string;
}>;

export type EstimateListItem = Readonly<{
  id: string;
  documentType: DocumentType;
  estimateNumber: string;
  projectName: string;
  preparedFor: string;
  status: EstimateStatus;
  totalMinor: string;
  updatedAt: string;
}>;

export type CreateEstimateDraftResponse = Readonly<{
  data: Readonly<{
    estimateId: string;
    status: "draft";
    replayed: boolean;
  }>;
}>;

export type EstimateScopeItem = Readonly<{
  sortOrder: number;
  description: string;
}>;

export type EstimateTextItem = Readonly<{
  sortOrder: number;
  description: string;
}>;

export type EstimatePricingLine = Readonly<{
  sortOrder: number;
  description: string;
  amountMinor: string;
}>;

export type EstimateTotalsContract = Readonly<{
  subtotalMinor: string;
  salesTaxMinor: string;
  totalMinor: string;
  requiredDepositMinor: string;
  remainingBalanceMinor: string;
  alternateTotalMinor: string;
}>;

export type EstimateDetail = Readonly<{
  id: string;
  customerId: string;
  customerName: string;
  projectId: string;
  documentType: DocumentType;
  estimateNumber: string;
  estimateDate: string;
  validThrough: string;
  bidDue: string;
  projectName: string;
  projectLocation: string;
  preparedFor: string;
  contactInformation: string;
  status: EstimateStatus;
  revisionNumber: string;
  rowVersion: string;
  depositPercent: string;
  taxRatePercent: "0";
  includeAlternatePricing: boolean;
  includePrevailingWageStatement: boolean;
  prevailingWageStatement: string;
  leadTime: string;
  pricingValidDays: string;
  projectNotes: string;
  scopeItems: readonly EstimateScopeItem[];
  pricingLines: readonly EstimatePricingLine[];
  alternatePricingLines: readonly EstimatePricingLine[];
  terms: readonly EstimateTextItem[];
  addenda: readonly EstimateTextItem[];
  totals: EstimateTotalsContract;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}>;

export type UpdateEstimateDraftRequest = Readonly<{
  expectedRowVersion: string;
  documentType: DocumentType;
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
  includePrevailingWageStatement: boolean;
  prevailingWageStatement: string;
  leadTime: string;
  pricingValidDays: string;
  projectNotes: string;
  scopeItems: readonly Readonly<{ description: string }>[];
  pricingLines: readonly Readonly<{
    description: string;
    amountMinor: string;
  }>[];
  alternatePricingLines: readonly Readonly<{
    description: string;
    amountMinor: string;
  }>[];
  terms: readonly Readonly<{ description: string }>[];
  addenda: readonly Readonly<{ description: string }>[];
}>;

export type GetEstimateResponse = Readonly<{ data: EstimateDetail }>;
export type UpdateEstimateDraftResponse = Readonly<{ data: EstimateDetail }>;

export type ListEstimatesResponse = Readonly<{
  data: readonly EstimateListItem[];
  page: Readonly<{ nextCursor: string | null }>;
}>;

export type EstimateApiErrorBody = Readonly<{
  error: Readonly<{
    code: string;
    message: string;
    requestId: string;
    fields?: Readonly<Record<string, string>>;
  }>;
}>;

export const CANONICAL_MINOR_UNITS_PATTERN =
  /^(?:0|-?[1-9]\d*)$/;
export const CANONICAL_DECIMAL_PATTERN =
  /^(?:0|[1-9]\d*)(?:\.\d*[1-9])?$/;
export const CANONICAL_ROW_VERSION_PATTERN = /^[1-9]\d*$/;

export function isCanonicalMinorUnits(value: unknown): value is string {
  return (
    typeof value === "string" && CANONICAL_MINOR_UNITS_PATTERN.test(value)
  );
}

export function isCanonicalDecimal(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_DECIMAL_PATTERN.test(value);
}
