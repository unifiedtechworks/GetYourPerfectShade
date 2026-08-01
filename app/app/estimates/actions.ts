"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createEstimateApiClient } from "@/lib/aws/api/estimate-client";
import { requireEstimateApiIdentity } from "@/lib/aws/api/estimate-identity";
import {
  calculateEstimateTotals,
  compareDecimal,
  decimalToString,
  parseDecimal,
  parseMoneyToMinorUnits,
  parsePercent,
} from "@/lib/estimates/calculations";
import type { CreateEstimateState } from "./types";

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

  redirect(`/app/estimates?created=${encodeURIComponent(estimateId)}`);
}
