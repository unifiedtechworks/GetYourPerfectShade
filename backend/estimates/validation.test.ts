import { describe, expect, it } from "vitest";
import type { UpdateEstimateDraftRequest } from "../../lib/aws/api/estimate-contracts";
import { validateUpdateDraftRequest } from "./validation";

const REQUEST: UpdateEstimateDraftRequest = {
  expectedRowVersion: "1",
  documentType: "Bid Proposal",
  estimateNumber: "",
  estimateDate: "",
  validThrough: "",
  bidDue: "",
  projectName: "Atrium",
  projectLocation: "Portland",
  preparedFor: "Morgan Architect",
  contactInformation: "Owner",
  depositPercent: "12.5",
  includeAlternatePricing: false,
  scopeItems: [{ description: "Scope" }],
  pricingLines: [{ description: "Base", amountMinor: "100" }],
  alternatePricingLines: [],
};

describe("Phase 2 update API validation", () => {
  it("accepts the canonical full-draft contract", () => {
    expect(validateUpdateDraftRequest(REQUEST)).toEqual(REQUEST);
  });

  it("rejects JSON-number money and stale-version numbers", () => {
    expect(() =>
      validateUpdateDraftRequest({
        ...REQUEST,
        expectedRowVersion: 1,
        pricingLines: [{ description: "Base", amountMinor: 100 }],
      }),
    ).toThrow(/Row version must be a positive integer string/);
    expect(() =>
      validateUpdateDraftRequest({
        ...REQUEST,
        pricingLines: [{ description: "Base", amountMinor: 100 }],
      }),
    ).toThrow(/canonical minor units/);
  });

  it("enforces scope, base-pricing, and alternate-pricing caps", () => {
    expect(() =>
      validateUpdateDraftRequest({
        ...REQUEST,
        scopeItems: Array.from({ length: 21 }, () => ({ description: "Scope" })),
      }),
    ).toThrow(/up to 20/);
    expect(() =>
      validateUpdateDraftRequest({
        ...REQUEST,
        pricingLines: Array.from({ length: 51 }, () => ({
          description: "Base",
          amountMinor: "1",
        })),
      }),
    ).toThrow(/up to 50/);
    expect(() =>
      validateUpdateDraftRequest({
        ...REQUEST,
        alternatePricingLines: Array.from({ length: 21 }, () => ({
          description: "Option",
          amountMinor: "1",
        })),
      }),
    ).toThrow(/up to 20/);
  });

  it("requires a base price and an enabled alternate price", () => {
    expect(() =>
      validateUpdateDraftRequest({ ...REQUEST, pricingLines: [] }),
    ).toThrow(/At least one pricing line/);
    expect(() =>
      validateUpdateDraftRequest({
        ...REQUEST,
        includeAlternatePricing: true,
        alternatePricingLines: [],
      }),
    ).toThrow(/no valid alternate pricing rows/);
  });

  it("rejects caller-supplied authorization context", () => {
    expect(() =>
      validateUpdateDraftRequest({ ...REQUEST, organizationId: "attacker" }),
    ).toThrow(/derived from the authenticated context/);
  });
});
