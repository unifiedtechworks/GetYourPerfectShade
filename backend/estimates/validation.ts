import {
  CANONICAL_DECIMAL_PATTERN,
  CANONICAL_MINOR_UNITS_PATTERN,
  CANONICAL_ROW_VERSION_PATTERN,
  type CreateEstimateDraftRequest,
  type DocumentType,
  type UpdateEstimateDraftRequest,
} from "../../lib/aws/api/estimate-contracts";
import {
  compareDecimal,
  parseDecimal,
} from "../../lib/estimates/calculations";
import { DEFAULT_PREVAILING_WAGE_STATEMENT } from "../../lib/estimates/presentation";
import { invalidRequest } from "./errors";

const BIGINT_MIN = -(2n ** 63n);
const BIGINT_MAX = 2n ** 63n - 1n;
const DOCUMENT_TYPES = new Set<DocumentType>(["Bid Proposal", "Estimate"]);
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function rejectCallerContext(record: Record<string, unknown>): void {
  for (const prohibited of [
    "organizationId",
    "actorId",
    "userId",
    "role",
    "membershipRole",
  ]) {
    if (prohibited in record) {
      throw invalidRequest(
        `${prohibited} is derived from the authenticated context.`,
      );
    }
  }
}

function canonicalMoney(value: unknown, field: string): string {
  if (
    typeof value !== "string" ||
    !CANONICAL_MINOR_UNITS_PATTERN.test(value)
  ) {
    throw invalidRequest(`${field} must be canonical minor units.`, {
      [field]: "Use a base-10 integer string.",
    });
  }
  const amount = BigInt(value);
  if (amount < BIGINT_MIN || amount > BIGINT_MAX) {
    throw invalidRequest(`${field} is outside the supported range.`, {
      [field]: "Must fit a signed 64-bit integer.",
    });
  }
  return value;
}

function canonicalPercent(value: unknown, field: string, label: string): string {
  if (typeof value !== "string" || !CANONICAL_DECIMAL_PATTERN.test(value)) {
    throw invalidRequest(`${label} must be a canonical decimal string.`, {
      [field]: "Use a non-negative canonical decimal string.",
    });
  }
  const percent = parseDecimal(value, label);
  if (
    compareDecimal(percent, parseDecimal("0", label)) < 0 ||
    compareDecimal(percent, parseDecimal("100", label)) > 0
  ) {
    throw invalidRequest(`${label} must be between 0 and 100.`, {
      [field]: "Must be between 0 and 100.",
    });
  }
  return value;
}

export function validateCreateDraftRequest(
  input: unknown,
): CreateEstimateDraftRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw invalidRequest("A JSON request body is required.");
  }
  const record = input as Record<string, unknown>;
  rejectCallerContext(record);

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

  const pricingAmountMinor = canonicalMoney(
    record.pricingAmountMinor,
    "pricingAmountMinor",
  );
  const depositPercent = canonicalPercent(
    record.depositPercent,
    "depositPercent",
    "Deposit %",
  );

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
    pricingAmountMinor,
    depositPercent,
  };
}

function pricingRows(
  value: unknown,
  field: "pricingLines" | "alternatePricingLines",
  maximum: number,
): readonly Readonly<{ description: string; amountMinor: string }>[] {
  if (!Array.isArray(value)) {
    throw invalidRequest(`${field} must be an array.`, {
      [field]: "Must be an array.",
    });
  }
  if (value.length > maximum) {
    throw invalidRequest(`${field} supports up to ${maximum} lines.`, {
      [field]: `Supports up to ${maximum} lines.`,
    });
  }
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw invalidRequest(`${field} row ${index + 1} is invalid.`);
    }
    const row = item as Record<string, unknown>;
    return {
      description: optionalString(
        row.description,
        `${field}.${index}.description`,
      ),
      amountMinor: canonicalMoney(
        row.amountMinor,
        `${field}.${index}.amountMinor`,
      ),
    };
  });
}

function textRows(
  value: unknown,
  field: "terms" | "addenda",
  maximum?: number,
): readonly Readonly<{ description: string }>[] {
  if (!Array.isArray(value)) {
    throw invalidRequest(`${field} must be an array.`, {
      [field]: "Must be an array.",
    });
  }
  if (maximum !== undefined && value.length > maximum) {
    throw invalidRequest(`${field} supports up to ${maximum} items.`, {
      [field]: `Supports up to ${maximum} items.`,
    });
  }
  return value.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw invalidRequest(`${field} row ${index + 1} is invalid.`);
    }
    return {
      description: requiredString(
        (item as Record<string, unknown>).description,
        `${field}.${index}.description`,
        `${field === "terms" ? "Term" : "Addendum"} row ${index + 1}`,
      ),
    };
  });
}

export function validateEstimateId(value: unknown): string {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw invalidRequest("Estimate ID is invalid.");
  }
  return value;
}

export function validateUpdateDraftRequest(
  input: unknown,
): UpdateEstimateDraftRequest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw invalidRequest("A JSON request body is required.");
  }
  const record = input as Record<string, unknown>;
  rejectCallerContext(record);

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
    typeof record.expectedRowVersion !== "string" ||
    !CANONICAL_ROW_VERSION_PATTERN.test(record.expectedRowVersion)
  ) {
    throw invalidRequest("Row version must be a positive integer string.", {
      expectedRowVersion: "Reload the draft before saving.",
    });
  }
  if (!Array.isArray(record.scopeItems)) {
    throw invalidRequest("scopeItems must be an array.");
  }
  if (record.scopeItems.length > 20) {
    throw invalidRequest("Scope of work supports up to 20 items.", {
      scopeItems: "Supports up to 20 items.",
    });
  }
  const scopeItems = record.scopeItems.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw invalidRequest(`Scope row ${index + 1} is invalid.`);
    }
    return {
      description: requiredString(
        (item as Record<string, unknown>).description,
        `scopeItems.${index}.description`,
        `Scope row ${index + 1}`,
      ),
    };
  });
  const pricingLines = pricingRows(record.pricingLines, "pricingLines", 50);
  if (pricingLines.length === 0) {
    throw invalidRequest(
      "At least one pricing line with a valid amount is required.",
      { pricingLines: "Add at least one pricing line." },
    );
  }
  const alternatePricingLines = pricingRows(
    record.alternatePricingLines,
    "alternatePricingLines",
    20,
  );
  if (typeof record.includeAlternatePricing !== "boolean") {
    throw invalidRequest("includeAlternatePricing must be a boolean.");
  }
  if (record.includeAlternatePricing && alternatePricingLines.length === 0) {
    throw invalidRequest(
      "Include Alternate Pricing is checked, but no valid alternate pricing rows were entered.",
      { alternatePricingLines: "Add at least one alternate pricing line." },
    );
  }
  if (typeof record.includePrevailingWageStatement !== "boolean") {
    throw invalidRequest("includePrevailingWageStatement must be a boolean.");
  }
  const prevailingWageStatement =
    optionalString(record.prevailingWageStatement, "prevailingWageStatement") ||
    DEFAULT_PREVAILING_WAGE_STATEMENT;
  const terms = textRows(record.terms, "terms", 20);
  const addenda = textRows(record.addenda, "addenda");

  return {
    expectedRowVersion: record.expectedRowVersion,
    documentType: documentType as DocumentType,
    estimateNumber: optionalString(record.estimateNumber, "estimateNumber"),
    estimateDate: optionalString(record.estimateDate, "estimateDate"),
    validThrough: optionalString(record.validThrough, "validThrough"),
    bidDue: optionalString(record.bidDue, "bidDue"),
    projectName: requiredString(
      record.projectName,
      "projectName",
      "Project Name",
    ),
    projectLocation: optionalString(
      record.projectLocation,
      "projectLocation",
    ),
    preparedFor: requiredString(record.preparedFor, "preparedFor", "Architect"),
    contactInformation: optionalString(
      record.contactInformation,
      "contactInformation",
    ),
    depositPercent: canonicalPercent(
      record.depositPercent,
      "depositPercent",
      "Deposit %",
    ),
    includeAlternatePricing: record.includeAlternatePricing,
    includePrevailingWageStatement: record.includePrevailingWageStatement,
    prevailingWageStatement,
    leadTime: optionalString(record.leadTime, "leadTime"),
    pricingValidDays: optionalString(
      record.pricingValidDays,
      "pricingValidDays",
    ),
    projectNotes: optionalString(record.projectNotes, "projectNotes"),
    scopeItems,
    pricingLines,
    alternatePricingLines,
    terms,
    addenda,
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
