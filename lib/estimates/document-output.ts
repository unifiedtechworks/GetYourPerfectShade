import { createHash } from "node:crypto";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import {
  PDFDocument,
  StandardFonts,
  type PDFFont,
  type PDFPage,
  rgb,
} from "pdf-lib";
import type {
  EstimateDetail,
  EstimatePricingLine,
} from "../aws/api/estimate-contracts";
import { formatCurrencyFromMinorUnits } from "./calculations";
import {
  COMPANY_QUALIFICATIONS_TEXT,
  coreTerms,
  CRAFTSMANSHIP_WARRANTY_TEXT,
  MEASUREMENT_READINESS_TEXT,
  visibleProposalSections,
} from "./presentation";

export const ESTIMATE_EXPORT_SCHEMA = "perfect-shade-estimate-export/v1";
export const ESTIMATE_DOCUMENT_GENERATOR_VERSION = "phase-4/v1";
export const ESTIMATE_DOWNLOAD_TTL_SECONDS = 300;

export type EstimateDocumentType = "docx" | "pdf" | "json";

export type GeneratedEstimateDocument = Readonly<{
  bytes: Uint8Array;
  checksumSha256: string;
  contentType: string;
  filename: string;
  type: EstimateDocumentType;
}>;

const CONTENT_TYPES: Readonly<Record<EstimateDocumentType, string>> = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
  json: "application/json; charset=utf-8",
};

const WINDOWS_RESERVED = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sanitizeFilenamePart(
  value: string,
  fallback = "Untitled Project",
): string {
  let cleaned = value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/g, "")
    .replace(/[. ]+$/g, "")
    .slice(0, 120)
    .replace(/[. ]+$/g, "");
  if (!cleaned || cleaned === "." || cleaned === "..") cleaned = fallback;
  if (WINDOWS_RESERVED.test(cleaned)) cleaned = `Project ${cleaned}`;
  return cleaned;
}

function isoDate(value: Date): string {
  if (Number.isNaN(value.getTime())) throw new Error("Generation date is invalid.");
  return value.toISOString().slice(0, 10);
}

export function buildEstimateFilename(
  estimate: Pick<EstimateDetail, "projectName" | "revisionNumber">,
  type: EstimateDocumentType,
  generatedAt: Date,
): string {
  const project = sanitizeFilenamePart(estimate.projectName);
  const revision = Number(estimate.revisionNumber) > 1
    ? ` - Rev ${estimate.revisionNumber}`
    : "";
  return `${isoDate(generatedAt)} - ${project} - Perfect Shade Bid${revision}.${type}`;
}

export function buildEstimateDocumentKey(input: Readonly<{
  organizationId: string;
  estimateId: string;
  revision: string;
  documentId: string;
  type: EstimateDocumentType;
}>): string {
  if (!UUID_PATTERN.test(input.organizationId)) {
    throw new Error("Trusted organization ID is invalid.");
  }
  if (!UUID_PATTERN.test(input.estimateId) || !UUID_PATTERN.test(input.documentId)) {
    throw new Error("Document identity is invalid.");
  }
  if (!/^[1-9]\d*$/.test(input.revision)) {
    throw new Error("Estimate revision is invalid.");
  }
  if (!Object.hasOwn(CONTENT_TYPES, input.type)) {
    throw new Error("Document type is invalid.");
  }
  return [
    "organizations",
    input.organizationId,
    "estimates",
    input.estimateId,
    "revisions",
    input.revision,
    "documents",
    `${input.documentId}.${input.type}`,
  ].join("/");
}

function money(value: string): string {
  const amount = BigInt(value);
  const sign = amount < 0n ? "-" : "";
  const absolute = amount < 0n ? -amount : amount;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

function displayMoney(value: string): string {
  return formatCurrencyFromMinorUnits(BigInt(value));
}

function exportPricing(lines: readonly EstimatePricingLine[]) {
  return lines.map((line) => ({
    sortOrder: line.sortOrder,
    description: line.description,
    amount: money(line.amountMinor),
  }));
}

function exportTextRows(
  rows: readonly Readonly<{ sortOrder: number; description: string }>[],
) {
  return rows.map((row) => ({
    sortOrder: row.sortOrder,
    description: row.description,
  }));
}

export function buildEstimateExport(
  estimate: EstimateDetail,
  generatedAt: Date,
) {
  return {
    schema: ESTIMATE_EXPORT_SCHEMA,
    generatedAt: generatedAt.toISOString(),
    estimate: {
      documentType: estimate.documentType,
      estimateNumber: estimate.estimateNumber,
      estimateDate: estimate.estimateDate,
      validThrough: estimate.validThrough,
      bidDue: estimate.bidDue,
      status: estimate.status,
      revisionNumber: estimate.revisionNumber,
      customerName: estimate.customerName,
      project: {
        name: estimate.projectName,
        location: estimate.projectLocation,
        preparedFor: estimate.preparedFor,
        contactInformation: estimate.contactInformation,
      },
      scopeItems: exportTextRows(estimate.scopeItems),
      pricingLines: exportPricing(estimate.pricingLines),
      alternatePricing: {
        included: estimate.includeAlternatePricing,
        lines: exportPricing(estimate.alternatePricingLines),
      },
      depositPercent: estimate.depositPercent,
      taxRatePercent: estimate.taxRatePercent,
      totals: {
        subtotal: money(estimate.totals.subtotalMinor),
        salesTax: money(estimate.totals.salesTaxMinor),
        total: money(estimate.totals.totalMinor),
        requiredDeposit: money(estimate.totals.requiredDepositMinor),
        remainingBalance: money(estimate.totals.remainingBalanceMinor),
        alternateTotal: money(estimate.totals.alternateTotalMinor),
      },
      terms: exportTextRows(estimate.terms),
      addenda: exportTextRows(estimate.addenda),
      prevailingWage: {
        included: estimate.includePrevailingWageStatement,
        statement: estimate.prevailingWageStatement,
      },
      leadTime: estimate.leadTime,
      pricingValidDays: estimate.pricingValidDays,
      projectNotes: estimate.projectNotes,
      constantSections: {
        measurementReadiness: MEASUREMENT_READINESS_TEXT,
        craftsmanshipWarranty: CRAFTSMANSHIP_WARRANTY_TEXT,
        companyQualifications: COMPANY_QUALIFICATIONS_TEXT,
      },
    },
  } as const;
}

export function generateEstimateJson(
  estimate: EstimateDetail,
  generatedAt: Date,
): Uint8Array {
  return new TextEncoder().encode(
    `${JSON.stringify(buildEstimateExport(estimate, generatedAt), null, 2)}\n`,
  );
}

const BLUE = "245680";
const LIGHT_BLUE = "D8E8F4";
const WHITE = "FFFFFF";
const BLACK = "111111";

function docxText(text: string, options: Readonly<{
  bold?: boolean;
  color?: string;
  italics?: boolean;
  size?: number;
}> = {}) {
  return new TextRun({
    text,
    bold: options.bold,
    color: options.color ?? BLACK,
    italics: options.italics,
    size: options.size ?? 20,
    font: "Arial",
  });
}

function docxTextRuns(text: string, options: Parameters<typeof docxText>[1] = {}) {
  return text.split("\n").map((line, index) => new TextRun({
    text: line,
    break: index === 0 ? undefined : 1,
    bold: options.bold,
    color: options.color ?? BLACK,
    italics: options.italics,
    size: options.size ?? 20,
    font: "Arial",
  }));
}

function docxParagraph(
  text: string,
  options: Readonly<{
    bold?: boolean;
    bullet?: boolean;
    color?: string;
    heading?: boolean;
    italics?: boolean;
    spacingAfter?: number;
  }> = {},
) {
  return new Paragraph({
    children: [docxText(text, {
      bold: options.bold,
      color: options.color,
      italics: options.italics,
      size: options.heading ? 28 : 20,
    })],
    bullet: options.bullet ? { level: 0 } : undefined,
    keepNext: options.heading,
    spacing: { after: options.spacingAfter ?? (options.heading ? 90 : 55) },
  });
}

function docxHeading(text: string) {
  return docxParagraph(text, {
    bold: true,
    color: BLUE,
    heading: true,
    italics: true,
    spacingAfter: 70,
  });
}

function docxCell(
  text: string,
  options: Readonly<{
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    bold?: boolean;
    color?: string;
    fill?: string;
  }> = {},
) {
  return new TableCell({
    shading: options.fill
      ? { fill: options.fill, type: ShadingType.CLEAR, color: "auto" }
      : undefined,
    margins: { top: 70, bottom: 70, left: 100, right: 100 },
    children: [new Paragraph({
      alignment: options.alignment,
      children: docxTextRuns(text, {
        bold: options.bold,
        color: options.color,
      }),
      spacing: { after: 0 },
    })],
  });
}

function docxTable(rows: readonly TableRow[], widths = [68, 32]) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: widths.map((width) => Math.round(9200 * width / 100)),
    borders: {
      top: { style: BorderStyle.SINGLE, size: 2, color: "91B8D8" },
      bottom: { style: BorderStyle.SINGLE, size: 2, color: "91B8D8" },
      left: { style: BorderStyle.SINGLE, size: 2, color: "91B8D8" },
      right: { style: BorderStyle.SINGLE, size: 2, color: "91B8D8" },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "91B8D8" },
      insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "91B8D8" },
    },
    rows: [...rows],
  });
}

function pricingTable(
  lines: readonly EstimatePricingLine[],
  totals: readonly Readonly<{ label: string; value: string; emphasized?: boolean }>[],
) {
  const rows = [
    new TableRow({
      tableHeader: true,
      children: [
        docxCell("Description", { bold: true, color: WHITE, fill: BLUE }),
        docxCell("Amount", {
          alignment: AlignmentType.RIGHT,
          bold: true,
          color: WHITE,
          fill: BLUE,
        }),
      ],
    }),
    ...lines.map((line) => new TableRow({ children: [
      docxCell(line.description),
      docxCell(displayMoney(line.amountMinor), { alignment: AlignmentType.RIGHT }),
    ] })),
    ...totals.map((total) => new TableRow({ children: [
      docxCell(total.label, {
        alignment: AlignmentType.RIGHT,
        bold: total.emphasized,
        color: BLUE,
        fill: LIGHT_BLUE,
      }),
      docxCell(total.value, {
        alignment: AlignmentType.RIGHT,
        bold: total.emphasized,
        fill: LIGHT_BLUE,
      }),
    ] })),
  ];
  return docxTable(rows);
}

function documentChildren(estimate: EstimateDetail) {
  const sections = new Set(visibleProposalSections(estimate));
  const children: (Paragraph | Table)[] = [
    docxParagraph("PERFECT SHADE LLC", { bold: true, color: BLUE, heading: true }),
    docxParagraph(estimate.documentType.toUpperCase(), { bold: true }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.NONE }, insideVertical: { style: BorderStyle.NONE },
      },
      rows: [new TableRow({ children: [
        docxCell("Perfect Shade LLC\nSheri Brannan\n133 Pine Tree Avenue\nUmatilla, Oregon 97882\nOregon CCB 250146\nWashington CCB PREFESL768Q\nEmail: ps.perfectshade@gmail.com\nPhone: 541-571-4675\nWebsite: getyourperfectshade.com"),
        docxCell(`Bid No.\n${estimate.estimateNumber}\nPrepared\n${estimate.estimateDate}\nValid Through\n${estimate.validThrough}\nStatus\n${estimate.status.toUpperCase()} · Revision ${estimate.revisionNumber}`, {
          alignment: AlignmentType.RIGHT,
          bold: true,
          color: BLUE,
        }),
      ] })],
    }),
    docxHeading("Bid Information"),
    docxTable([
      ["Bid Due", estimate.bidDue],
      ["Project", estimate.projectName],
      ["Location", estimate.projectLocation],
      ["Architect", estimate.preparedFor],
      ["Owner", estimate.contactInformation],
    ].map(([label, value]) => new TableRow({ children: [
      docxCell(label, { bold: true, color: BLUE, fill: LIGHT_BLUE }),
      docxCell(value),
    ] })), [50, 50]),
    docxHeading("Scope of Work"),
    docxParagraph(`Provide all materials and installation for window coverings for ${estimate.projectName}.`),
    ...estimate.scopeItems.map((item) => docxParagraph(item.description, { bullet: true })),
  ];

  if (sections.has("addenda")) {
    children.push(
      docxHeading("Addenda Acknowledgement"),
      docxParagraph("Perfect Shade has acknowledged the following addenda:"),
      ...estimate.addenda.map((item) => docxParagraph(item.description, { bullet: true })),
    );
  }

  children.push(
    docxHeading("Pricing"),
    pricingTable(estimate.pricingLines, [
      { label: "Subtotal", value: displayMoney(estimate.totals.subtotalMinor), emphasized: true },
      { label: "Total", value: displayMoney(estimate.totals.totalMinor), emphasized: true },
      { label: "Required Deposit", value: displayMoney(estimate.totals.requiredDepositMinor) },
      { label: "Balance Due", value: displayMoney(estimate.totals.remainingBalanceMinor), emphasized: true },
    ]),
  );

  if (sections.has("alternates")) {
    children.push(
      docxHeading("Alternate Pricing"),
      pricingTable(estimate.alternatePricingLines, [{
        label: "Alternate Total",
        value: displayMoney(estimate.totals.alternateTotalMinor),
        emphasized: true,
      }]),
      docxParagraph("Alternate pricing is provided for consideration only and is not included in the base bid total unless accepted in writing."),
    );
  }

  children.push(docxHeading("Terms"));
  children.push(...coreTerms(estimate).map((term) => docxParagraph(term, { bullet: true })));
  if (sections.has("additionalTerms")) {
    children.push(
      docxParagraph("Additional terms or exclusions:"),
      ...estimate.terms.map((term) => docxParagraph(term.description, { bullet: true })),
    );
  }
  if (sections.has("prevailingWage")) {
    children.push(
      docxHeading("Prevailing Wage"),
      docxParagraph(estimate.prevailingWageStatement),
    );
  }
  children.push(
    docxHeading("Measurement Readiness"),
    docxParagraph(MEASUREMENT_READINESS_TEXT),
    docxHeading("Craftsmanship Warranty"),
    docxParagraph(CRAFTSMANSHIP_WARRANTY_TEXT),
    docxHeading("Company Qualifications"),
    docxParagraph(COMPANY_QUALIFICATIONS_TEXT),
  );
  if (sections.has("projectNotes")) {
    children.push(
      docxHeading("Project Notes"),
      docxParagraph(`Project Notes: ${estimate.projectNotes}`),
    );
  }
  children.push(
    docxHeading("Authorization and Acceptance"),
    docxParagraph("By signing below, the client acknowledges acceptance of the scope, pricing, and terms described in this proposal."),
    docxTable([new TableRow({ children: [
      docxCell("Perfect Shade Authorized Signature\nSheri Brannan\n\n____________________________________\nDate:" , { bold: true, color: BLUE }),
      docxCell("Authorized Signature\n\n\n____________________________________\nDate:", { bold: true, color: BLUE }),
    ] })], [50, 50]),
  );
  return children;
}

export async function generateEstimateDocx(
  estimate: EstimateDetail,
): Promise<Uint8Array> {
  const document = new Document({
    creator: "Perfect Shade Web Estimate Builder",
    title: `${estimate.documentType} - ${estimate.projectName}`,
    description: "Perfect Shade client proposal",
    styles: {
      default: {
        document: { run: { font: "Arial", size: 20, color: BLACK } },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 720, right: 800, bottom: 720, left: 800 },
          size: { width: 12240, height: 15840 },
        },
      },
      footers: {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [docxText(`Perfect Shade LLC | ${estimate.documentType}`, { color: "666666", size: 18 })],
        })] }),
      },
      children: documentChildren(estimate),
    }],
  });
  return new Uint8Array(await Packer.toBuffer(document));
}

type PdfContext = {
  document: PDFDocument;
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  italic: PDFFont;
  y: number;
};

const PDF_WIDTH = 612;
const PDF_HEIGHT = 792;
const PDF_MARGIN = 42;

function newPdfPage(context: Omit<PdfContext, "page" | "y">): PdfContext {
  return {
    ...context,
    page: context.document.addPage([PDF_WIDTH, PDF_HEIGHT]),
    y: PDF_HEIGHT - PDF_MARGIN,
  };
}

function wrapPdfText(text: string, font: PDFFont, size: number, width: number) {
  const paragraphs = text.split("\n");
  const lines: string[] = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (!line || font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
      else {
        lines.push(line);
        line = word;
      }
    }
    lines.push(line);
  }
  return lines;
}

function ensurePdfSpace(context: PdfContext, height: number): PdfContext {
  if (context.y - height >= PDF_MARGIN + 18) return context;
  return newPdfPage(context);
}

function pdfText(
  context: PdfContext,
  text: string,
  options: Readonly<{
    color?: ReturnType<typeof rgb>;
    font?: PDFFont;
    indent?: number;
    size?: number;
    spacingAfter?: number;
  }> = {},
): PdfContext {
  const font = options.font ?? context.regular;
  const size = options.size ?? 10;
  const indent = options.indent ?? 0;
  const lineHeight = size * 1.28;
  const lines = wrapPdfText(text, font, size, PDF_WIDTH - (2 * PDF_MARGIN) - indent);
  context = ensurePdfSpace(context, lines.length * lineHeight + (options.spacingAfter ?? 4));
  for (const line of lines) {
    context.page.drawText(line, {
      x: PDF_MARGIN + indent,
      y: context.y - size,
      size,
      font,
      color: options.color ?? rgb(0.07, 0.07, 0.07),
    });
    context.y -= lineHeight;
  }
  context.y -= options.spacingAfter ?? 4;
  return context;
}

function pdfHeading(context: PdfContext, text: string): PdfContext {
  context = ensurePdfSpace(context, 24);
  return pdfText(context, text, {
    color: rgb(0.14, 0.34, 0.5),
    font: context.italic,
    size: 14,
    spacingAfter: 5,
  });
}

function pdfBullet(context: PdfContext, text: string): PdfContext {
  return pdfText(context, `•  ${text}`, { indent: 8, spacingAfter: 2 });
}

function pdfTable(
  context: PdfContext,
  rows: readonly Readonly<{ left: string; right: string; kind?: "header" | "total" }>[],
): PdfContext {
  const width = PDF_WIDTH - (2 * PDF_MARGIN);
  const leftWidth = width * 0.68;
  for (const row of rows) {
    const font = row.kind ? context.bold : context.regular;
    const leftLines = wrapPdfText(row.left, font, 9.5, leftWidth - 12);
    const rightLines = wrapPdfText(row.right, font, 9.5, width - leftWidth - 12);
    const height = Math.max(leftLines.length, rightLines.length) * 12 + 6;
    context = ensurePdfSpace(context, height);
    const fill = row.kind === "header"
      ? rgb(0.14, 0.34, 0.5)
      : row.kind === "total" ? rgb(0.75, 0.85, 0.93) : rgb(1, 1, 1);
    context.page.drawRectangle({
      x: PDF_MARGIN,
      y: context.y - height,
      width,
      height,
      color: fill,
      borderColor: rgb(0.55, 0.72, 0.84),
      borderWidth: 0.5,
    });
    context.page.drawLine({
      start: { x: PDF_MARGIN + leftWidth, y: context.y },
      end: { x: PDF_MARGIN + leftWidth, y: context.y - height },
      color: rgb(0.55, 0.72, 0.84),
      thickness: 0.5,
    });
    const color = row.kind === "header" ? rgb(1, 1, 1) : rgb(0.05, 0.05, 0.05);
    leftLines.forEach((line, index) => context.page.drawText(line, {
      x: PDF_MARGIN + 6,
      y: context.y - 12 - (index * 12),
      size: 9.5,
      font,
      color,
    }));
    rightLines.forEach((line, index) => context.page.drawText(line, {
      x: PDF_MARGIN + width - 6 - font.widthOfTextAtSize(line, 9.5),
      y: context.y - 12 - (index * 12),
      size: 9.5,
      font,
      color,
    }));
    context.y -= height;
  }
  context.y -= 7;
  return context;
}

export function buildEstimatePdfText(estimate: EstimateDetail): readonly string[] {
  const sections = new Set(visibleProposalSections(estimate));
  return [
    "PERFECT SHADE LLC",
    estimate.documentType.toUpperCase(),
    `${estimate.status.toUpperCase()} · Revision ${estimate.revisionNumber}`,
    "Bid Information",
    estimate.projectName,
    "Scope of Work",
    `Provide all materials and installation for window coverings for ${estimate.projectName}.`,
    ...estimate.scopeItems.map((item) => item.description),
    ...(sections.has("addenda")
      ? ["Addenda Acknowledgement", ...estimate.addenda.map((item) => item.description)]
      : []),
    "Pricing",
    ...estimate.pricingLines.flatMap((line) => [line.description, displayMoney(line.amountMinor)]),
    displayMoney(estimate.totals.totalMinor),
    ...(sections.has("alternates")
      ? [
          "Alternate Pricing",
          ...estimate.alternatePricingLines.flatMap((line) => [line.description, displayMoney(line.amountMinor)]),
          "Alternate pricing is provided for consideration only and is not included in the base bid total unless accepted in writing.",
        ]
      : []),
    "Terms",
    ...coreTerms(estimate),
    ...(sections.has("additionalTerms") ? estimate.terms.map((term) => term.description) : []),
    ...(sections.has("prevailingWage")
      ? ["Prevailing Wage", estimate.prevailingWageStatement]
      : []),
    "Measurement Readiness",
    MEASUREMENT_READINESS_TEXT,
    "Craftsmanship Warranty",
    CRAFTSMANSHIP_WARRANTY_TEXT,
    "Company Qualifications",
    COMPANY_QUALIFICATIONS_TEXT,
    ...(sections.has("projectNotes") ? ["Project Notes", estimate.projectNotes] : []),
    "Authorization and Acceptance",
    "By signing below, the client acknowledges acceptance of the scope, pricing, and terms described in this proposal.",
  ];
}

export async function generateEstimatePdf(
  estimate: EstimateDetail,
  generatedAt: Date,
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  document.setTitle(`${estimate.documentType} - ${estimate.projectName}`);
  document.setAuthor("Perfect Shade LLC");
  document.setCreator("Perfect Shade Web Estimate Builder");
  document.setProducer(ESTIMATE_DOCUMENT_GENERATOR_VERSION);
  document.setCreationDate(generatedAt);
  document.setModificationDate(generatedAt);
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const italic = await document.embedFont(StandardFonts.HelveticaOblique);
  let context = newPdfPage({ document, regular, bold, italic });
  const sections = new Set(visibleProposalSections(estimate));

  context = pdfText(context, "PERFECT SHADE LLC", {
    color: rgb(0.14, 0.34, 0.5), font: bold, size: 24, spacingAfter: 7,
  });
  context = pdfText(context, estimate.documentType.toUpperCase(), {
    font: bold, size: 13, spacingAfter: 7,
  });
  context = pdfText(context, `Bid No. ${estimate.estimateNumber || "-"}  |  Prepared ${estimate.estimateDate || "-"}  |  Valid Through ${estimate.validThrough || "-"}`,
    { color: rgb(0.14, 0.34, 0.5), font: bold, spacingAfter: 2 });
  context = pdfText(context, `${estimate.status.toUpperCase()} · Revision ${estimate.revisionNumber}`,
    { color: rgb(0.14, 0.34, 0.5), font: bold, spacingAfter: 8 });
  context = pdfHeading(context, "Bid Information");
  context = pdfTable(context, [
    { left: "Bid Due", right: estimate.bidDue },
    { left: "Project", right: estimate.projectName },
    { left: "Location", right: estimate.projectLocation },
    { left: "Architect", right: estimate.preparedFor },
    { left: "Owner", right: estimate.contactInformation },
  ]);
  context = pdfHeading(context, "Scope of Work");
  context = pdfText(context, `Provide all materials and installation for window coverings for ${estimate.projectName}.`);
  for (const item of estimate.scopeItems) context = pdfBullet(context, item.description);
  if (sections.has("addenda")) {
    context = pdfHeading(context, "Addenda Acknowledgement");
    context = pdfText(context, "Perfect Shade has acknowledged the following addenda:");
    for (const item of estimate.addenda) context = pdfBullet(context, item.description);
  }
  context = pdfHeading(context, "Pricing");
  context = pdfTable(context, [
    { left: "Description", right: "Amount", kind: "header" },
    ...estimate.pricingLines.map((line) => ({ left: line.description, right: displayMoney(line.amountMinor) })),
    { left: "Subtotal", right: displayMoney(estimate.totals.subtotalMinor), kind: "total" },
    { left: "Total", right: displayMoney(estimate.totals.totalMinor), kind: "total" },
    { left: "Required Deposit", right: displayMoney(estimate.totals.requiredDepositMinor) },
    { left: "Balance Due", right: displayMoney(estimate.totals.remainingBalanceMinor), kind: "total" },
  ]);
  if (sections.has("alternates")) {
    context = pdfHeading(context, "Alternate Pricing");
    context = pdfTable(context, [
      { left: "Description", right: "Amount", kind: "header" },
      ...estimate.alternatePricingLines.map((line) => ({ left: line.description, right: displayMoney(line.amountMinor) })),
      { left: "Alternate Total", right: displayMoney(estimate.totals.alternateTotalMinor), kind: "total" },
    ]);
    context = pdfText(context, "Alternate pricing is provided for consideration only and is not included in the base bid total unless accepted in writing.");
  }
  context = pdfHeading(context, "Terms");
  for (const term of coreTerms(estimate)) context = pdfBullet(context, term);
  if (sections.has("additionalTerms")) {
    context = pdfText(context, "Additional terms or exclusions:");
    for (const term of estimate.terms) context = pdfBullet(context, term.description);
  }
  if (sections.has("prevailingWage")) {
    context = pdfHeading(context, "Prevailing Wage");
    context = pdfText(context, estimate.prevailingWageStatement);
  }
  for (const [heading, body] of [
    ["Measurement Readiness", MEASUREMENT_READINESS_TEXT],
    ["Craftsmanship Warranty", CRAFTSMANSHIP_WARRANTY_TEXT],
    ["Company Qualifications", COMPANY_QUALIFICATIONS_TEXT],
  ] as const) {
    context = pdfHeading(context, heading);
    context = pdfText(context, body);
  }
  if (sections.has("projectNotes")) {
    context = pdfHeading(context, "Project Notes");
    context = pdfText(context, `Project Notes: ${estimate.projectNotes}`);
  }
  context = pdfHeading(context, "Authorization and Acceptance");
  context = pdfText(context, "By signing below, the client acknowledges acceptance of the scope, pricing, and terms described in this proposal.");
  context = ensurePdfSpace(context, 70);
  context.page.drawText("Perfect Shade Authorized Signature", { x: PDF_MARGIN, y: context.y - 12, size: 10, font: bold, color: rgb(0.14, 0.34, 0.5) });
  context.page.drawText("Authorized Signature", { x: 330, y: context.y - 12, size: 10, font: bold, color: rgb(0.14, 0.34, 0.5) });
  context.page.drawLine({ start: { x: PDF_MARGIN, y: context.y - 48 }, end: { x: 270, y: context.y - 48 }, thickness: 0.7 });
  context.page.drawLine({ start: { x: 330, y: context.y - 48 }, end: { x: 558, y: context.y - 48 }, thickness: 0.7 });
  context.page.drawText("Date:", { x: PDF_MARGIN, y: context.y - 62, size: 10, font: regular });
  context.page.drawText("Date:", { x: 330, y: context.y - 62, size: 10, font: regular });

  document.getPages().forEach((page, index, pages) => {
    const footer = `Perfect Shade LLC | ${estimate.documentType} | Page ${index + 1} of ${pages.length}`;
    page.drawText(footer, {
      x: (PDF_WIDTH - regular.widthOfTextAtSize(footer, 8)) / 2,
      y: 20,
      size: 8,
      font: regular,
      color: rgb(0.4, 0.4, 0.4),
    });
  });
  return new Uint8Array(await document.save({ useObjectStreams: false }));
}

export async function generateEstimateDocument(
  estimate: EstimateDetail,
  type: EstimateDocumentType,
  generatedAt = new Date(),
): Promise<GeneratedEstimateDocument> {
  let bytes: Uint8Array;
  if (type === "docx") bytes = await generateEstimateDocx(estimate);
  else if (type === "pdf") bytes = await generateEstimatePdf(estimate, generatedAt);
  else if (type === "json") bytes = generateEstimateJson(estimate, generatedAt);
  else throw new Error("Document type is invalid.");
  return {
    bytes,
    checksumSha256: createHash("sha256").update(bytes).digest("hex"),
    contentType: CONTENT_TYPES[type],
    filename: buildEstimateFilename(estimate, type, generatedAt),
    type,
  };
}
