import { describe, expect, it } from "vitest";
import type { EstimateDetail } from "../aws/api/estimate-contracts";
import {
  COMPANY_QUALIFICATIONS_TEXT,
  CRAFTSMANSHIP_WARRANTY_TEXT,
  DEFAULT_PREVAILING_WAGE_STATEMENT,
  MEASUREMENT_READINESS_TEXT,
  RETAINAGE_TERM_TEXT,
  SALES_TAX_NOTICE_TEXT,
  coreTerms,
  visibleProposalSections,
} from "./presentation";

function detail(overrides: Partial<EstimateDetail> = {}): EstimateDetail {
  return {
    id: "estimate",
    customerId: "customer",
    customerName: "Customer",
    projectId: "project",
    documentType: "Bid Proposal",
    estimateNumber: "B-100",
    estimateDate: "August 9, 2026",
    validThrough: "",
    bidDue: "",
    projectName: "Atrium",
    projectLocation: "Portland",
    preparedFor: "Morgan Architect",
    contactInformation: "Owner",
    status: "draft",
    sourceEstimateId: null,
    revisionNumber: "1",
    rowVersion: "1",
    issuedAt: null,
    issuedBy: null,
    depositPercent: "50",
    taxRatePercent: "0",
    includeAlternatePricing: false,
    includePrevailingWageStatement: false,
    prevailingWageStatement: DEFAULT_PREVAILING_WAGE_STATEMENT,
    leadTime: "4-6 weeks",
    pricingValidDays: "30",
    projectNotes: "",
    scopeItems: [],
    pricingLines: [],
    alternatePricingLines: [],
    terms: [],
    addenda: [],
    totals: {
      subtotalMinor: "10000",
      salesTaxMinor: "0",
      totalMinor: "10000",
      requiredDepositMinor: "5000",
      remainingBalanceMinor: "5000",
      alternateTotalMinor: "0",
    },
    createdBy: "actor",
    updatedBy: "actor",
    createdAt: "2026-08-09T00:00:00Z",
    updatedAt: "2026-08-09T00:00:00Z",
    ...overrides,
  };
}

describe("desktop-aligned proposal presentation", () => {
  it("keeps exact approved constant wording", () => {
    expect(DEFAULT_PREVAILING_WAGE_STATEMENT).toBe(
      "Applicable prevailing wage labor rates are included where required by the project.",
    );
    expect(RETAINAGE_TERM_TEXT).toBe(
      "Maximum retainage shall be limited to 5% of the contract amount unless otherwise agreed in writing.",
    );
    expect(SALES_TAX_NOTICE_TEXT).toContain("valid tax exemption certificate");
    expect(MEASUREMENT_READINESS_TEXT).toBe(
      "Measurement Readiness: Final measurements should not be requested or scheduled until the project area is ready, accessible, and reasonably prepared for accurate measuring. If there are questions about site readiness, mounting conditions, product requirements, or any other measurement-related requirements, Customer/Contractor should contact Perfect Shade LLC before requesting or scheduling final measurements. Additional trips, re-measures, or delays caused by incomplete site conditions, inaccessible areas, unclear requirements, construction changes, or other conditions outside Perfect Shade LLC’s control may result in additional charges.",
    );
    expect(CRAFTSMANSHIP_WARRANTY_TEXT).toBe(
      "Perfect Shade provides a one-year craftsmanship warranty on installation labor. This warranty covers defects in workmanship under normal use and does not cover product defects, misuse, damage by others, changes to surrounding construction, or conditions outside Perfect Shade’s control.",
    );
    expect(COMPANY_QUALIFICATIONS_TEXT).toBe(
      "Perfect Shade LLC is a locally owned and operated window covering company serving commercial, healthcare, municipal, educational, multifamily, and professional facilities throughout Eastern Oregon and Eastern Washington. We routinely assist with value engineering, product coordination, dependable project execution, and clean professional installation. Our lead installer has more than 15 years of experience installing window coverings throughout the Tri-Cities and surrounding region. References are available upon request.",
    );
  });

  it("orders core terms and treats retainage as wording, not a deduction", () => {
    expect(coreTerms(detail())).toEqual([
      "50% deposit required prior to ordering materials.",
      "Balance due upon substantial completion.",
      "Pricing is valid for 30 days unless otherwise stated.",
      "Changes to the approved scope of work may result in additional charges.",
      "Estimated lead time: 4-6 weeks.",
      SALES_TAX_NOTICE_TEXT,
      RETAINAGE_TERM_TEXT,
    ]);
    expect(detail().totals.totalMinor).toBe("10000");
  });

  it("suppresses malformed dynamic sentences when optional values are blank", () => {
    const terms = coreTerms(detail({ pricingValidDays: "  ", leadTime: "" }));
    expect(terms).not.toContain("Pricing is valid for  days unless otherwise stated.");
    expect(terms).not.toContain("Estimated lead time: .");
    expect(terms.some((term) => term.startsWith("Pricing is valid for"))).toBe(false);
    expect(terms.some((term) => term.startsWith("Estimated lead time:"))).toBe(false);
  });

  it("normalizes trailing lead-time punctuation without changing saved wording", () => {
    expect(coreTerms(detail({ leadTime: "4-6 weeks. " }))).toContain(
      "Estimated lead time: 4-6 weeks.",
    );
  });

  it("suppresses empty or disabled conditional sections and preserves output order", () => {
    expect(visibleProposalSections(detail())).toEqual([
      "project",
      "scope",
      "pricing",
      "terms",
      "measurementReadiness",
      "warranty",
      "qualifications",
    ]);
    expect(
      visibleProposalSections(
        detail({
          includeAlternatePricing: true,
          includePrevailingWageStatement: true,
          alternatePricingLines: [
            { sortOrder: 0, description: "Option", amountMinor: "500" },
          ],
          addenda: [{ sortOrder: 0, description: "Addendum 1" }],
          terms: [{ sortOrder: 0, description: "Electrical by others" }],
          projectNotes: "Coordinate access.",
        }),
      ),
    ).toEqual([
      "project",
      "scope",
      "addenda",
      "pricing",
      "alternates",
      "terms",
      "additionalTerms",
      "prevailingWage",
      "measurementReadiness",
      "warranty",
      "qualifications",
      "projectNotes",
    ]);
  });

  it("does not show blank-looking text sections but preserves valid amount-only alternates", () => {
    expect(visibleProposalSections(detail({
      addenda: [{ sortOrder: 0, description: "  " }],
      terms: [{ sortOrder: 0, description: "" }],
      includeAlternatePricing: true,
      alternatePricingLines: [{ sortOrder: 0, description: "  ", amountMinor: "0" }],
      includePrevailingWageStatement: true,
      prevailingWageStatement: "  ",
    }))).not.toEqual(expect.arrayContaining([
      "addenda",
      "additionalTerms",
      "prevailingWage",
    ]));
    expect(visibleProposalSections(detail({
      includeAlternatePricing: true,
      alternatePricingLines: [
        { sortOrder: 0, description: "  ", amountMinor: "0" },
      ],
    }))).toContain("alternates");
  });
});
