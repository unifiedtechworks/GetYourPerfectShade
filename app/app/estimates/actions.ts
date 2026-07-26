"use server";

import { redirect } from "next/navigation";
import { requireOrganizationAccount } from "@/lib/auth/account";
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
  const { supabase, organizationId } = await requireOrganizationAccount();
  const { data, error } = await supabase.rpc("create_estimate_draft", {
    target_organization_id: organizationId,
    customer_name: fields.customerName,
    project_name: fields.projectName,
    project_location: fields.projectLocation,
    prepared_for: fields.preparedFor,
    contact_information: fields.contactInformation,
    document_type: fields.documentType,
    estimate_number: fields.estimateNumber,
    pricing_description: fields.pricingDescription,
    pricing_amount_minor: totals.totalMinor.toString(),
    deposit_percent: decimalToString(depositPercent),
  });

  if (error || typeof data !== "string") {
    return {
      message:
        "The draft could not be created. Confirm the Phase 1 migration is applied and try again.",
      fields,
    };
  }

  redirect(`/app/estimates?created=${encodeURIComponent(data)}`);
}
