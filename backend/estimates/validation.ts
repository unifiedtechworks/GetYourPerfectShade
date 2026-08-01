import {
  CANONICAL_DECIMAL_PATTERN,
  CANONICAL_MINOR_UNITS_PATTERN,
  type CreateEstimateDraftRequest,
  type DocumentType,
} from "../../lib/aws/api/estimate-contracts";
import {
  compareDecimal,
  parseDecimal,
} from "../../lib/estimates/calculations";
import { invalidRequest } from "./errors";

const BIGINT_MIN = -(2n ** 63n);
const BIGINT_MAX = 2n ** 63n - 1n;
const DOCUMENT_TYPES = new Set<DocumentType>(["Bid Proposal", "Estimate"]);

function requiredString(
  value: unknown,
  field: string,
  label: string,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw invalidRequest(`${label} is required.`, { [field]: `${label} is required.` });
  }
  return value.trim();
}

function optionalString(value: unknown, field: string): string {
  if (value === undefined) return "";
  if (typeof value !== "string") {
    throw invalidRequest(`${field} must be a string.`, {
      [field]: "Must be a string.",
    });
  }
  return value.trim();
}

export function validateCreateDraftRequest(
  input: unknown,
): CreateEstimateDraftRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw invalidRequest("A JSON request body is required.");
  }
  const record = input as Record<string, unknown>;
  for (const prohibited of [
    "organizationId",
    "actorId",
    "userId",
    "role",
    "membershipRole",
  ]) {
    if (prohibited in record) {
      throw invalidRequest(`${prohibited} is derived from the authenticated context.`);
    }
  }

  const documentType = requiredString(
    record.documentType,
    "documentType",
    "Document Type",
  );
  if (!DOCUMENT_TYPES.has(documentType as DocumentType)) {
    throw invalidRequest("Choose a supported document type.", {
      documentType: "Choose Bid Proposal or Estimate.",
    });
  }

  if (
    typeof record.pricingAmountMinor !== "string" ||
    !CANONICAL_MINOR_UNITS_PATTERN.test(record.pricingAmountMinor)
  ) {
    throw invalidRequest("Pricing amount must be canonical minor units.", {
      pricingAmountMinor: "Use a base-10 integer string.",
    });
  }
  const amount = BigInt(record.pricingAmountMinor);
  if (amount < BIGINT_MIN || amount > BIGINT_MAX) {
    throw invalidRequest("Pricing amount is outside the supported range.", {
      pricingAmountMinor: "Must fit a signed 64-bit integer.",
    });
  }

  if (
    typeof record.depositPercent !== "string" ||
    !CANONICAL_DECIMAL_PATTERN.test(record.depositPercent)
  ) {
    throw invalidRequest("Deposit % must be a canonical decimal string.", {
      depositPercent: "Use a non-negative canonical decimal string.",
    });
  }
  const deposit = parseDecimal(record.depositPercent, "Deposit %");
  if (
    compareDecimal(deposit, parseDecimal("0", "Deposit %")) < 0 ||
    compareDecimal(deposit, parseDecimal("100", "Deposit %")) > 0
  ) {
    throw invalidRequest("Deposit % must be between 0 and 100.", {
      depositPercent: "Must be between 0 and 100.",
    });
  }

  return {
    customerName: requiredString(record.customerName, "customerName", "Customer Name"),
    projectName: requiredString(record.projectName, "projectName", "Project Name"),
    projectLocation: optionalString(record.projectLocation, "projectLocation"),
    preparedFor: requiredString(record.preparedFor, "preparedFor", "Architect"),
    contactInformation: optionalString(
      record.contactInformation,
      "contactInformation",
    ),
    documentType: documentType as DocumentType,
    estimateNumber: optionalString(record.estimateNumber, "estimateNumber"),
    pricingDescription: optionalString(
      record.pricingDescription,
      "pricingDescription",
    ),
    pricingAmountMinor: record.pricingAmountMinor,
    depositPercent: record.depositPercent,
  };
}

export function validateIdempotencyKey(value: string | undefined): string {
  const key = value?.trim();
  if (!key || key.length < 16 || key.length > 200 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw invalidRequest(
      "A valid Idempotency-Key header is required for draft creation.",
    );
  }
  return key;
}
