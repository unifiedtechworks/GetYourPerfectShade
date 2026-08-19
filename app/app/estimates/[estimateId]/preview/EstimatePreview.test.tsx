import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EstimateDetail } from "../../../../../lib/aws/api/estimate-contracts";
import { DEFAULT_PREVAILING_WAGE_STATEMENT } from "../../../../../lib/estimates/presentation";
import { EstimatePreview } from "./EstimatePreview";

function estimate(overrides: Partial<EstimateDetail> = {}): EstimateDetail {
  return {
    id: "estimate-id",
    customerId: "customer-id",
    customerName: "Customer",
    projectId: "project-id",
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
    rowVersion: "7",
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
    scopeItems: [{ sortOrder: 0, description: "Measure and install" }],
    pricingLines: [{ sortOrder: 0, description: "Base", amountMinor: "10000" }],
    alternatePricingLines: [
      { sortOrder: 0, description: "Motorized", amountMinor: "50000" },
    ],
    terms: [],
    addenda: [],
    totals: {
      subtotalMinor: "10000",
      salesTaxMinor: "0",
      totalMinor: "10000",
      requiredDepositMinor: "5000",
      remainingBalanceMinor: "5000",
      alternateTotalMinor: "50000",
    },
    createdBy: "secret-created-actor",
    updatedBy: "secret-updated-actor",
    createdAt: "2026-08-09T00:00:00Z",
    updatedAt: "2026-08-09T00:00:00Z",
    ...overrides,
  };
}

function previewMarkup(detail: EstimateDetail): string {
  const { createdBy: _createdBy, updatedBy: _updatedBy, ...safe } = detail;
  return renderToStaticMarkup(<EstimatePreview estimate={safe} />);
}

describe("protected saved-draft estimate preview", () => {
  it("provides browser print rules without interactive controls", () => {
    const css = readFileSync(
      join(
        process.cwd(),
        "app",
        "app",
        "estimates",
        "[estimateId]",
        "preview",
        "preview.module.css",
      ),
      "utf8",
    );
    expect(css).toContain("@media print");
    expect(css).toContain("@page");
    expect(css).toContain("size: Letter portrait");
    expect(css).toMatch(/\.actions,\s*\.printButton\s*\{\s*display:\s*none !important;/);
    expect(css).toMatch(/\.draftBanner\s*\{\s*display:\s*none !important;/);
    expect(css).toContain("print-color-adjust: exact");
    expect(css).toContain("break-after: avoid-page");
    expect(css).toMatch(/\.pricingTable tr,\s*\.pricingTable tfoot\s*\{[^}]*break-inside:\s*avoid-page/s);
    expect(css).toMatch(/\.authorizationSection,\s*\.signatureColumns\s*\{[^}]*break-inside:\s*avoid-page !important/s);
    expect(css).not.toContain(".document section, .document table { break-inside: avoid; }");
  });

  it("scopes standalone printing to the preview and removes protected application chrome", () => {
    const appCss = readFileSync(
      join(process.cwd(), "app", "app", "app.module.css"),
      "utf8",
    );
    const pageSource = readFileSync(
      join(
        process.cwd(),
        "app",
        "app",
        "estimates",
        "[estimateId]",
        "preview",
        "page.tsx",
      ),
      "utf8",
    );
    expect(pageSource).toContain("data-estimate-print-preview");
    expect(appCss).toMatch(/@media print[\s\S]*\.shell:has\(\[data-estimate-print-preview\]\)/);
    expect(appCss).toMatch(/\.shell:has\(\[data-estimate-print-preview\]\) \.sidebar\s*\{\s*display:\s*none !important;/);
    expect(appCss).toMatch(/\.shell:has\(\[data-estimate-print-preview\]\) \.content\s*\{[^}]*padding:\s*0;[^}]*overflow:\s*visible;/s);
  });

  it("labels the preview as a draft and excludes internal actor and row-version data", () => {
    const markup = previewMarkup(estimate());
    expect(markup).toContain("Draft preview - not a final document");
    expect(markup).not.toContain("secret-created-actor");
    expect(markup).not.toContain("secret-updated-actor");
    expect(markup).not.toContain("rowVersion");
    expect(markup).not.toContain("estimate-id");
  });

  it("does not mislabel a read-only issued estimate as a draft", () => {
    const markup = previewMarkup(estimate({ status: "issued" }));
    expect(markup).toContain("issued estimate preview");
    expect(markup).not.toContain("Draft preview - not a final document");
  });

  it("suppresses disabled or empty optional sections", () => {
    const markup = previewMarkup(estimate());
    expect(markup).not.toContain("Alternate Pricing");
    expect(markup).not.toContain("Addenda Acknowledgement");
    expect(markup).not.toContain("Additional terms or exclusions:");
    expect(markup).not.toContain("Prevailing Wage</h2>");
    expect(markup).not.toContain("Project Notes</h2>");
  });

  it("shows enabled optional content in desktop order without changing the main total", () => {
    const markup = previewMarkup(
      estimate({
        includeAlternatePricing: true,
        includePrevailingWageStatement: true,
        terms: [{ sortOrder: 0, description: "Electrical by others" }],
        addenda: [{ sortOrder: 0, description: "Addendum 2" }],
        projectNotes: "Coordinate access.",
      }),
    );
    const ordered = [
      "Scope of Work",
      "Addenda Acknowledgement",
      "Pricing",
      "Alternate Pricing",
      "Terms",
      "Additional terms or exclusions:",
      "Prevailing Wage",
      "Measurement Readiness",
      "Craftsmanship Warranty",
      "Company Qualifications",
      "Project Notes",
    ].map((heading) => markup.indexOf(heading));
    expect(ordered.every((index) => index >= 0)).toBe(true);
    expect(ordered).toEqual([...ordered].sort((a, b) => a - b));
    expect(markup).toContain("$100.00");
    expect(markup).toContain("$500.00");
    expect(markup).toContain(
      "Alternate pricing is provided for consideration only and is not included in the base bid total unless accepted in writing.",
    );
  });

  it("matches the bid header, information, pricing, authorization, and footer hierarchy", () => {
    const markup = previewMarkup(estimate());
    expect(markup).toContain("PERFECT SHADE LLC");
    expect(markup).toContain("BID PROPOSAL");
    for (const label of ["Bid No.", "Prepared", "Valid Through", "Bid Due", "Project", "Location", "Architect", "Owner"]) {
      expect(markup).toContain(label);
    }
    expect(markup).toContain("Required Deposit");
    expect(markup).toContain("Balance Due");
    expect(markup).toContain("Authorization and Acceptance");
    expect(markup).toContain("authorizationSection");
    expect(markup).toContain("Perfect Shade Authorized Signature");
    expect(markup).toContain("Authorized Signature");
    expect(markup).toContain("Perfect Shade LLC | Bid Proposal");
  });

  it("suppresses blank dynamic terms and a blank enabled prevailing-wage section", () => {
    const markup = previewMarkup(estimate({
      includePrevailingWageStatement: true,
      prevailingWageStatement: " ",
      pricingValidDays: "",
      leadTime: " ",
    }));
    expect(markup).not.toContain("Pricing is valid for  days");
    expect(markup).not.toContain("Estimated lead time: .");
    expect(markup).not.toContain("Prevailing Wage</h2>");
  });
});
