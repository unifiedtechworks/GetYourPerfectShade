"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  createEstimateApiClient,
  EstimateApiError,
} from "@/lib/aws/api/estimate-client";
import { requireEstimateApiIdentity } from "@/lib/aws/api/estimate-identity";
import {
  calculateEstimateTotals,
  compareDecimal,
  decimalToString,
  parseDecimal,
  parseMoneyToMinorUnits,
  parsePercent,
} from "@/lib/estimates/calculations";
import {
  type EstimateEditorPricingRow,
  type EstimateEditorTextRow,
  validateEstimateEditor,
} from "@/lib/estimates/editor";
import type { CreateEstimateState, SaveEstimateState } from "./types";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export async function createEstimate(
  _previousState: CreateEstimateState,
  formData: FormData,
): Promise<CreateEstimateState> {
  const fields = {
    customerName: field(formData, "customerName"),
    projectName: field(formData, "projectName"),
    projectLocation: field(formData, "projectLocation"),
    preparedFor: field(formData, "preparedFor"),
    contactInformation: field(formData, "contactInformation"),
    documentType: field(formData, "documentType"),
    estimateNumber: field(formData, "estimateNumber"),
    pricingDescription: field(formData, "pricingDescription"),
    pricingAmount: field(formData, "pricingAmount"),
    depositPercent: field(formData, "depositPercent"),
  };

  if (!fields.customerName) {
    return { message: "Customer Name is required.", fields };
  }
  if (!fields.projectName) {
    return { message: "Project Name is required.", fields };
  }
  if (!fields.preparedFor) {
    return { message: "Architect is required.", fields };
  }
  if (!["Bid Proposal", "Estimate"].includes(fields.documentType)) {
    return { message: "Choose a supported document type.", fields };
  }

  let pricingAmountMinor: bigint;
  let depositPercent;
  try {
    pricingAmountMinor = parseMoneyToMinorUnits(fields.pricingAmount);
    depositPercent = parsePercent(fields.depositPercent, "Deposit %");
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : "Check the estimate amounts.",
      fields,
    };
  }

  const zero = parseDecimal("0", "Deposit %");
  const oneHundred = parseDecimal("100", "Deposit %");
  if (
    compareDecimal(depositPercent, zero) < 0 ||
    compareDecimal(depositPercent, oneHundred) > 0
  ) {
    return { message: "Deposit % must be between 0 and 100.", fields };
  }

  const totals = calculateEstimateTotals([pricingAmountMinor], depositPercent);
  const { accessToken } = await requireEstimateApiIdentity();
  let estimateId: string;
  try {
    const result = await createEstimateApiClient({ accessToken }).createDraft(
      {
        customerName: fields.customerName,
        projectName: fields.projectName,
        projectLocation: fields.projectLocation,
        preparedFor: fields.preparedFor,
        contactInformation: fields.contactInformation,
        documentType: fields.documentType as "Bid Proposal" | "Estimate",
        estimateNumber: fields.estimateNumber,
        pricingDescription: fields.pricingDescription,
        pricingAmountMinor: totals.totalMinor.toString(),
        depositPercent: decimalToString(depositPercent),
      },
      randomUUID(),
    );
    estimateId = result.data.estimateId;
  } catch {
    return {
      message: "The draft could not be created. Please try again.",
      fields,
    };
  }

  redirect(`/app/estimates/${encodeURIComponent(estimateId)}?created=1`);
}

function parsedRows<T>(
  formData: FormData,
  name: string,
  normalize: (record: Record<string, unknown>, index: number) => T,
): readonly T[] {
  const value = formData.get(name);
  if (typeof value !== "string") throw new Error("Draft rows are missing.");
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("Draft rows are invalid.");
  return parsed.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error("Draft rows are invalid.");
    }
    return normalize(item as Record<string, unknown>, index);
  });
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export async function updateEstimate(
  estimateId: string,
  previousState: SaveEstimateState,
  formData: FormData,
): Promise<SaveEstimateState> {
  let scopeItems: readonly EstimateEditorTextRow[];
  let pricingLines: readonly EstimateEditorPricingRow[];
  let alternatePricingLines: readonly EstimateEditorPricingRow[];
  try {
    scopeItems = parsedRows(formData, "scopeItemsJson", (row, index) => ({
      key: stringValue(row.key) || `scope-${index}`,
      description: stringValue(row.description),
    }));
    pricingLines = parsedRows(formData, "pricingLinesJson", (row, index) => ({
      key: stringValue(row.key) || `pricing-${index}`,
      description: stringValue(row.description),
      amount: stringValue(row.amount),
    }));
    alternatePricingLines = parsedRows(
      formData,
      "alternatePricingLinesJson",
      (row, index) => ({
        key: stringValue(row.key) || `alternate-${index}`,
        description: stringValue(row.description),
        amount: stringValue(row.amount),
      }),
    );
  } catch {
    return {
      status: "error",
      message: "The draft rows could not be read. Reload and try again.",
      saveSequence: previousState.saveSequence + 1,
    };
  }

  const validation = validateEstimateEditor({
    expectedRowVersion: field(formData, "expectedRowVersion"),
    documentType: field(formData, "documentType"),
    estimateNumber: field(formData, "estimateNumber"),
    estimateDate: field(formData, "estimateDate"),
    validThrough: field(formData, "validThrough"),
    bidDue: field(formData, "bidDue"),
    projectName: field(formData, "projectName"),
    projectLocation: field(formData, "projectLocation"),
    preparedFor: field(formData, "preparedFor"),
    contactInformation: field(formData, "contactInformation"),
    depositPercent: field(formData, "depositPercent"),
    includeAlternatePricing: formData.get("includeAlternatePricing") === "on",
    scopeItems,
    pricingLines,
    alternatePricingLines,
  });
  if (!validation.request) {
    return {
      status: "error",
      message: "Please correct the highlighted estimate details.",
      fields: validation.fields,
      saveSequence: previousState.saveSequence + 1,
    };
  }

  try {
    const { accessToken } = await requireEstimateApiIdentity();
    const result = await createEstimateApiClient({ accessToken }).updateDraft(
      estimateId,
      validation.request,
    );
    revalidatePath("/app/estimates");
    revalidatePath(`/app/estimates/${estimateId}`);
    return {
      status: "success",
      message: "Draft saved.",
      rowVersion: result.data.rowVersion,
      savedAt: result.data.updatedAt,
      saveSequence: previousState.saveSequence + 1,
    };
  } catch (error) {
    if (error instanceof EstimateApiError) {
      const status =
        error.code === "stale_estimate"
          ? "stale"
          : error.code === "estimate_not_editable"
            ? "readonly"
            : "error";
      return {
        status,
        message: error.message,
        fields: error.fields,
        saveSequence: previousState.saveSequence + 1,
      };
    }
    return {
      status: "error",
      message: "The draft could not be saved. Please try again.",
      saveSequence: previousState.saveSequence + 1,
    };
  }
}
