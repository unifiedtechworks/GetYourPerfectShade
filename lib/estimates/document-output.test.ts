import { PDFDocument } from "pdf-lib";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { EstimateDetail } from "../aws/api/estimate-contracts";
import {
  buildEstimateDocumentKey,
  buildEstimateExport,
  buildEstimateFilename,
  buildEstimatePdfText,
  ESTIMATE_EXPORT_SCHEMA,
  generateEstimateDocx,
  generateEstimateJson,
  generateEstimatePdf,
  sanitizeFilenamePart,
} from "./document-output";
import {
  COMPANY_QUALIFICATIONS_TEXT,
  CRAFTSMANSHIP_WARRANTY_TEXT,
  DEFAULT_PREVAILING_WAGE_STATEMENT,
  MEASUREMENT_READINESS_TEXT,
  RETAINAGE_TERM_TEXT,
} from "./presentation";

function estimate(overrides: Partial<EstimateDetail> = {}): EstimateDetail {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    customerId: "33333333-3333-4333-8333-333333333333",
    customerName: "City of Umatilla",
    projectId: "44444444-4444-4444-8444-444444444444",
    documentType: "Bid Proposal",
    estimateNumber: "PST-V01-QA",
    estimateDate: "2026-08-01",
    validThrough: "2026-08-31",
    bidDue: "2026-08-08",
    projectName: "Umatilla City Hall Roller Shades",
    projectLocation: "Umatilla, OR",
    preparedFor: "Acme Architecture",
    contactInformation: "City of Umatilla\nAttn: Facilities Manager",
    status: "draft",
    sourceEstimateId: null,
    revisionNumber: "1",
    rowVersion: "4",
    issuedAt: null,
    issuedBy: null,
    depositPercent: "50",
    taxRatePercent: "0",
    includeAlternatePricing: true,
    includePrevailingWageStatement: true,
    prevailingWageStatement: DEFAULT_PREVAILING_WAGE_STATEMENT,
    leadTime: "4-6 weeks after approved field measurements",
    pricingValidDays: "30",
    projectNotes: "Final colors to be confirmed.",
    scopeItems: [
      { sortOrder: 0, description: "Furnish and install manual roller shades." },
      { sortOrder: 1, description: "Coordinate final field measurements." },
    ],
    pricingLines: [
      { sortOrder: 0, description: "Materials", amountMinor: "425000" },
      { sortOrder: 1, description: "Installation", amountMinor: "175000" },
    ],
    alternatePricingLines: [
      { sortOrder: 0, description: "Motorized upgrade", amountMinor: "240000" },
    ],
    terms: [{ sortOrder: 0, description: "Electrical work by others." }],
    addenda: [{ sortOrder: 0, description: "Addendum 1" }],
    totals: {
      subtotalMinor: "600000",
      salesTaxMinor: "0",
      totalMinor: "600000",
      requiredDepositMinor: "300000",
      remainingBalanceMinor: "300000",
      alternateTotalMinor: "240000",
    },
    createdBy: "internal-creator",
    updatedBy: "internal-updater",
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T01:00:00.000Z",
    ...overrides,
  };
}

const GENERATED_AT = new Date("2026-08-09T12:34:56.000Z");

describe("Phase 4 filename and object-key safety", () => {
  it("preserves the desktop-readable core while removing unsafe path content", () => {
    expect(sanitizeFilenamePart('  ACME: West / Phase*1?  ')).toBe(
      "ACME West Phase1",
    );
    expect(sanitizeFilenamePart("../..\\CON")).toBe("Project CON");
    expect(sanitizeFilenamePart('<>:"/\\|?*')).toBe("Untitled Project");
    expect(buildEstimateFilename(estimate(), "docx", GENERATED_AT)).toBe(
      "2026-08-09 - Umatilla City Hall Roller Shades - Perfect Shade Bid.docx",
    );
    expect(buildEstimateFilename(
      estimate({ revisionNumber: "2" }),
      "pdf",
      GENERATED_AT,
    )).toContain(" - Rev 2.pdf");
  });

  it("builds a server-trusted, organization-scoped, collision-safe key", () => {
    expect(buildEstimateDocumentKey({
      organizationId: "11111111-1111-4111-8111-111111111111",
      estimateId: "22222222-2222-4222-8222-222222222222",
      revision: "2",
      documentId: "55555555-5555-4555-8555-555555555555",
      type: "json",
    })).toBe(
      "organizations/11111111-1111-4111-8111-111111111111/estimates/22222222-2222-4222-8222-222222222222/revisions/2/documents/55555555-5555-4555-8555-555555555555.json",
    );
    expect(() => buildEstimateDocumentKey({
      organizationId: "../another-tenant",
      estimateId: estimate().id,
      revision: "1",
      documentId: "55555555-5555-4555-8555-555555555555",
      type: "pdf",
    })).toThrow("Trusted organization ID is invalid");
  });
});

describe("Phase 4 structured JSON export", () => {
  it("uses a stable schema and safe money strings without internal metadata", () => {
    const exported = buildEstimateExport(estimate(), GENERATED_AT);
    expect(exported.schema).toBe(ESTIMATE_EXPORT_SCHEMA);
    expect(exported.estimate.status).toBe("draft");
    expect(exported.estimate.revisionNumber).toBe("1");
    expect(exported.estimate.totals.total).toBe("6000.00");
    expect(exported.estimate.totals.alternateTotal).toBe("2400.00");
    expect(exported.estimate.terms[0].description).toBe("Electrical work by others.");
    expect(exported.estimate.addenda[0].description).toBe("Addendum 1");
    expect(exported.estimate.constantSections).toEqual({
      measurementReadiness: MEASUREMENT_READINESS_TEXT,
      craftsmanshipWarranty: CRAFTSMANSHIP_WARRANTY_TEXT,
      companyQualifications: COMPANY_QUALIFICATIONS_TEXT,
    });

    const text = new TextDecoder().decode(generateEstimateJson(estimate(), GENERATED_AT));
    expect(text.endsWith("\n")).toBe(true);
    expect(text).not.toContain("internal-creator");
    expect(text).not.toContain("internal-updater");
    expect(text).not.toContain("rowVersion");
    expect(text).not.toContain("organizationId");
    expect(text).not.toContain("s3");
  });
});

describe("Phase 4 DOCX and PDF generation", () => {
  it("creates a valid-looking OOXML ZIP package", async () => {
    const bytes = await generateEstimateDocx(estimate());
    const packageDirectory = Buffer.from(bytes).toString("latin1");
    expect(Buffer.from(bytes.subarray(0, 2)).toString("ascii")).toBe("PK");
    expect(packageDirectory).toContain("[Content_Types].xml");
    expect(packageDirectory).toContain("word/document.xml");
    expect(bytes.length).toBeGreaterThan(5_000);
  });

  it("uses the approved wording, conditions, money, and alternate separation", () => {
    const text = buildEstimatePdfText(estimate());
    expect(text).toContain(RETAINAGE_TERM_TEXT);
    expect(text).toContain(MEASUREMENT_READINESS_TEXT);
    expect(text).toContain(CRAFTSMANSHIP_WARRANTY_TEXT);
    expect(text).toContain(COMPANY_QUALIFICATIONS_TEXT);
    expect(text).toContain(DEFAULT_PREVAILING_WAGE_STATEMENT);
    expect(text).toContain("$6,000.00");
    expect(text).toContain("$2,400.00");
    expect(text).toContain(
      "Alternate pricing is provided for consideration only and is not included in the base bid total unless accepted in writing.",
    );
    expect(text.indexOf("$2,400.00")).toBeGreaterThan(text.indexOf("$6,000.00"));

    const withoutOptional = buildEstimatePdfText(estimate({
      addenda: [],
      terms: [],
      includeAlternatePricing: false,
      includePrevailingWageStatement: false,
      projectNotes: "",
    }));
    expect(withoutOptional).not.toContain("Addenda Acknowledgement");
    expect(withoutOptional).not.toContain("Alternate Pricing");
    expect(withoutOptional).not.toContain("Prevailing Wage");
    expect(withoutOptional).not.toContain("Project Notes");
  });

  it("keeps valid amount-only pricing rows in DOCX and PDF output", async () => {
    const amountOnly = estimate({
      pricingLines: [
        { sortOrder: 0, description: "", amountMinor: "12345" },
      ],
      alternatePricingLines: [
        { sortOrder: 0, description: "", amountMinor: "6789" },
      ],
      totals: {
        subtotalMinor: "12345",
        salesTaxMinor: "0",
        totalMinor: "12345",
        requiredDepositMinor: "6173",
        remainingBalanceMinor: "6172",
        alternateTotalMinor: "6789",
      },
    });

    const text = buildEstimatePdfText(amountOnly);
    expect(text).toContain("$123.45");
    expect(text).toContain("Alternate Pricing");
    expect(text).toContain("$67.89");

    const docx = Buffer.from(await generateEstimateDocx(amountOnly)).toString(
      "latin1",
    );
    expect(docx).toContain("word/document.xml");
  });

  it("preserves the reference header, bid-information, pricing, authorization, and footer content", () => {
    const text = buildEstimatePdfText(estimate());
    const ordered = [
      "PERFECT SHADE LLC",
      "BID PROPOSAL",
      "Perfect Shade LLC",
      "Sheri Brannan",
      "Bid No.",
      "Prepared",
      "Valid Through",
      "Bid Information",
      "Bid Due",
      "Project",
      "Location",
      "Architect",
      "Owner",
      "Pricing",
      "Subtotal",
      "Total",
      "Required Deposit",
      "Balance Due",
      "Authorization and Acceptance",
      "Perfect Shade Authorized Signature",
      "Authorized Signature",
      "Perfect Shade LLC | Bid Proposal",
    ].map((value) => text.indexOf(value));
    expect(ordered.every((index) => index >= 0)).toBe(true);
    expect(ordered).toEqual([...ordered].sort((left, right) => left - right));
  });

  it("suppresses malformed optional terms and blank-looking optional sections", () => {
    const text = buildEstimatePdfText(estimate({
      addenda: [{ sortOrder: 0, description: " " }],
      terms: [{ sortOrder: 0, description: "" }],
      includePrevailingWageStatement: true,
      prevailingWageStatement: " ",
      pricingValidDays: "",
      leadTime: " ",
    }));
    expect(text).not.toContain("Pricing is valid for  days");
    expect(text).not.toContain("Estimated lead time: .");
    expect(text).not.toContain("Addenda Acknowledgement");
    expect(text).not.toContain("Prevailing Wage");
    expect(text).not.toContain("Additional terms or exclusions:");
  });

  it("embeds only the exact configurable Sheri signature asset", async () => {
    const signature = readFileSync(join(
      process.cwd(),
      "backend",
      "estimates",
      "assets",
      "sheri_signature.pssig",
    ));
    expect(createHash("sha256").update(signature).digest("hex")).toBe(
      "c68a92e9b7755b71922a0a1b15667b53d531aa9bc4cb8eea94d2c296902f717a",
    );

    const withoutSignature = await generateEstimateDocx(estimate());
    const withSignature = await generateEstimateDocx(estimate(), {
      companySignaturePng: signature,
    });
    expect(Buffer.from(withoutSignature).toString("latin1")).not.toContain("word/media/");
    expect(Buffer.from(withSignature).toString("latin1")).toContain("word/media/");
    expect(withSignature.length).toBeGreaterThan(withoutSignature.length);
  });

  it("creates a Word-free PDF and paginates long proposals", async () => {
    const manyScopeRows = Array.from({ length: 20 }, (_, index) => ({
      sortOrder: index,
      description: `Scope ${index + 1}: ${"Detailed installation coordination ".repeat(5)}`,
    }));
    const bytes = await generateEstimatePdf(
      estimate({ scopeItems: manyScopeRows }),
      GENERATED_AT,
    );
    expect(Buffer.from(bytes.subarray(0, 5)).toString("ascii")).toBe("%PDF-");
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBeGreaterThan(1);
  });

  it("supports the exact signature in the Word-free PDF without changing JSON", async () => {
    const signature = readFileSync(join(
      process.cwd(),
      "backend",
      "estimates",
      "assets",
      "sheri_signature.pssig",
    ));
    const withoutSignature = await generateEstimatePdf(estimate(), GENERATED_AT);
    const withSignature = await generateEstimatePdf(estimate(), GENERATED_AT, {
      companySignaturePng: signature,
    });
    expect(withSignature.length).toBeGreaterThan(withoutSignature.length);
    expect(new TextDecoder().decode(generateEstimateJson(estimate(), GENERATED_AT)))
      .not.toContain("signature");
  });
});
