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

export function isCanonicalMinorUnits(value: unknown): value is string {
  return (
    typeof value === "string" && CANONICAL_MINOR_UNITS_PATTERN.test(value)
  );
}

export function isCanonicalDecimal(value: unknown): value is string {
  return typeof value === "string" && CANONICAL_DECIMAL_PATTERN.test(value);
}
