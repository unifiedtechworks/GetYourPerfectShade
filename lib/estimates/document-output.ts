import { createHash } from "node:crypto";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  ImageRun,
  LevelFormat,
  LevelSuffix,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
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

export type EstimateRenderOptions = Readonly<{
  companySignaturePng?: Uint8Array;
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

const BLUE = "1F4E79";
const BID_INFO_BLUE = "DDEBF7";
const TOTAL_BLUE = "BDD7EE";
const BORDER_BLUE = "9FBAD0";
const WHITE = "FFFFFF";
const BLACK = "111111";
const DARK_GRAY = "505050";
const DOCX_CONTENT_WIDTH = 10224;
const COMPANY_BLOCK = [
  "Perfect Shade LLC",
  "Sheri Brannan",
  "133 Pine Tree Avenue",
  "Umatilla, Oregon 97882",
  "Oregon CCB 250146",
  "Washington CCB PREFESL768Q",
  "Email: ps.perfectshade@gmail.com",
  "Phone: 541-571-4675",
  "Website: getyourperfectshade.com",
] as const;

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
    size: options.size ?? 21,
    font: "Aptos",
  });
}

function docxTextRuns(text: string, options: Parameters<typeof docxText>[1] = {}) {
  return text.split("\n").map((line, index) => new TextRun({
    text: line,
    break: index === 0 ? undefined : 1,
    bold: options.bold,
    color: options.color ?? BLACK,
    italics: options.italics,
    size: options.size ?? 21,
    font: "Aptos",
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
    size?: number;
    spacingBefore?: number;
    spacingAfter?: number;
  }> = {},
) {
  return new Paragraph({
    children: [docxText(text, {
      bold: options.bold,
      color: options.color,
      italics: options.italics,
      size: options.size ?? (options.heading ? 27 : 21),
    })],
    numbering: options.bullet
      ? { reference: "perfect-shade-terms", level: 0 }
      : undefined,
    keepNext: options.heading,
    spacing: {
      before: options.spacingBefore ?? (options.heading ? 100 : 0),
      after: options.spacingAfter ?? 20,
      line: options.heading ? undefined : 240,
    },
  });
}

function docxHeading(text: string) {
  return docxParagraph(text, {
    bold: true,
    color: BLUE,
    heading: true,
    italics: true,
    spacingAfter: 20,
  });
}

function docxCell(
  text: string,
  options: Readonly<{
    alignment?: (typeof AlignmentType)[keyof typeof AlignmentType];
    bold?: boolean;
    color?: string;
    fill?: string;
    size?: number;
  }> = {},
) {
  return new TableCell({
    shading: options.fill
      ? { fill: options.fill, type: ShadingType.CLEAR, color: "auto" }
      : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 20, bottom: 20, left: 80, right: 80 },
    children: [new Paragraph({
      alignment: options.alignment,
      children: docxTextRuns(text, {
        bold: options.bold,
        color: options.color,
        size: options.size,
      }),
      spacing: { after: 0 },
    })],
  });
}

function tableBorders(bordered: boolean) {
  const border = bordered
    ? { style: BorderStyle.SINGLE, size: 6, color: BORDER_BLUE }
    : { style: BorderStyle.NONE, size: 0, color: WHITE };
  return {
    top: border,
    bottom: border,
    left: border,
    right: border,
    insideHorizontal: border,
    insideVertical: border,
  };
}

function docxTable(
  rows: readonly TableRow[],
  widths = [50, 50],
  bordered = true,
) {
  return new Table({
    width: { size: DOCX_CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: widths.map((width) => Math.round(DOCX_CONTENT_WIDTH * width / 100)),
    layout: TableLayoutType.FIXED,
    borders: tableBorders(bordered),
    rows: [...rows],
  });
}

function pricingTable(
  lines: readonly EstimatePricingLine[],
  totals: readonly Readonly<{
    bold?: boolean;
    label: string;
    value: string;
    treatment: "strong" | "light" | "plain";
  }>[],
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
    ...totals.map((total) => {
      const strong = total.treatment === "strong";
      const bold = strong || total.bold;
      const fill = strong
        ? TOTAL_BLUE
        : total.treatment === "light" ? BID_INFO_BLUE : undefined;
      return new TableRow({ children: [
        docxCell(total.label, {
          alignment: AlignmentType.RIGHT,
          bold,
          color: BLUE,
          fill,
        }),
        docxCell(total.value, {
          alignment: AlignmentType.RIGHT,
          bold,
          fill,
        }),
      ] });
    }),
  ];
  return docxTable(rows);
}

function nonblankRows<T extends Readonly<{ description: string }>>(
  rows: readonly T[],
): readonly T[] {
  return rows.filter((row) => Boolean(row.description.trim()));
}

function lifecycleLabel(estimate: EstimateDetail): string {
  return `${estimate.status.toUpperCase()} · Revision ${estimate.revisionNumber}`;
}

function headerTable(estimate: EstimateDetail) {
  const metadata = [
    "Bid No.",
    estimate.estimateNumber.trim(),
    "Prepared",
    estimate.estimateDate.trim(),
    "Valid Through",
    estimate.validThrough.trim(),
    "Status",
    lifecycleLabel(estimate),
  ].join("\n");
  return docxTable([new TableRow({ children: [
    docxCell(COMPANY_BLOCK.join("\n"), { size: 18 }),
    docxCell(metadata, {
      alignment: AlignmentType.RIGHT,
      bold: true,
      color: BLUE,
      size: 18,
    }),
  ] })], [50, 50], false);
}

function signatureCell(
  side: "company" | "client",
  companySignaturePng?: Uint8Array,
) {
  const isCompany = side === "company";
  const signatureParagraph = companySignaturePng && isCompany
    ? new Paragraph({
        children: [new ImageRun({
          data: companySignaturePng,
          type: "png",
          transformation: { width: 250, height: 65 },
        })],
        spacing: { before: 0, after: 0 },
      })
    : new Paragraph({
        children: [docxText("")],
        spacing: { before: 0, after: 700, line: 240 },
      });
  return new TableCell({
    margins: { top: 0, bottom: 0, left: 0, right: 120 },
    children: [
      new Paragraph({
        children: [docxText(
          isCompany ? "Perfect Shade Authorized Signature" : "Authorized Signature",
          { bold: true, color: BLUE },
        )],
        spacing: { before: 0, after: 0 },
      }),
      ...(isCompany ? [new Paragraph({
        children: [docxText("Sheri Brannan", { bold: true, color: BLUE })],
        spacing: { before: 0, after: 0 },
      })] : []),
      signatureParagraph,
      new Paragraph({
        children: [docxText("____________________________________")],
        spacing: { before: 0, after: 0 },
      }),
      new Paragraph({
        children: [docxText("Date:", {
          bold: !isCompany,
          color: isCompany ? BLACK : BLUE,
        })],
        spacing: { before: 0, after: 20 },
      }),
    ],
  });
}

function signatureTable(options: EstimateRenderOptions) {
  return docxTable([new TableRow({ children: [
    signatureCell("company", options.companySignaturePng),
    signatureCell("client"),
  ] })], [50, 50], false);
}

function documentChildren(
  estimate: EstimateDetail,
  options: EstimateRenderOptions,
) {
  const sections = new Set(visibleProposalSections(estimate));
  const projectName = estimate.projectName.trim() || "this project";
  const scopeItems = nonblankRows(estimate.scopeItems);
  const pricingLines = nonblankRows(estimate.pricingLines);
  const alternatePricingLines = nonblankRows(estimate.alternatePricingLines);
  const addenda = nonblankRows(estimate.addenda);
  const additionalTerms = nonblankRows(estimate.terms);
  const taxRows = BigInt(estimate.totals.salesTaxMinor) !== 0n
    ? [{
        label: `Sales Tax (${estimate.taxRatePercent}%)`,
        value: displayMoney(estimate.totals.salesTaxMinor),
        treatment: "plain" as const,
      }]
    : [];
  const children: (Paragraph | Table)[] = [
    docxParagraph("PERFECT SHADE LLC", {
      bold: true,
      color: BLUE,
      size: 46,
      spacingAfter: 0,
    }),
    docxParagraph(estimate.documentType.toUpperCase(), {
      bold: true,
      color: DARK_GRAY,
      size: 23,
      spacingAfter: 100,
    }),
    headerTable(estimate),
    docxHeading("Bid Information"),
    docxTable([
      ["Bid Due", estimate.bidDue],
      ["Project", estimate.projectName],
      ["Location", estimate.projectLocation],
      ["Architect", estimate.preparedFor],
      ["Owner", estimate.contactInformation],
    ].map(([label, value]) => new TableRow({ children: [
      docxCell(label, { bold: true, color: BLUE, fill: BID_INFO_BLUE }),
      docxCell(value),
    ] })), [50, 50]),
    docxHeading("Scope of Work"),
    docxParagraph(`Provide all materials and installation for window coverings for ${projectName}.`),
    ...scopeItems.map((item) => docxParagraph(item.description, { bullet: true })),
  ];

  if (sections.has("addenda")) {
    children.push(
      docxHeading("Addenda Acknowledgement"),
      docxParagraph("Perfect Shade has acknowledged the following addenda:"),
      ...addenda.map((item) => docxParagraph(item.description, { bullet: true })),
    );
  }

  children.push(
    docxHeading("Pricing"),
    pricingTable(pricingLines, [
      { label: "Subtotal", value: displayMoney(estimate.totals.subtotalMinor), treatment: "strong" },
      ...taxRows,
      { label: "Total", value: displayMoney(estimate.totals.totalMinor), treatment: "strong" },
      { label: "Required Deposit", value: displayMoney(estimate.totals.requiredDepositMinor), treatment: "light" },
      { label: "Balance Due", value: displayMoney(estimate.totals.remainingBalanceMinor), treatment: "light", bold: true },
    ]),
  );

  if (sections.has("alternates")) {
    children.push(
      docxHeading("Alternate Pricing"),
      pricingTable(alternatePricingLines, [{
        label: "Alternate Total",
        value: displayMoney(estimate.totals.alternateTotalMinor),
        treatment: "strong",
      }]),
      docxParagraph("Alternate pricing is provided for consideration only and is not included in the base bid total unless accepted in writing."),
    );
  }

  children.push(docxHeading("Terms"));
  children.push(...coreTerms(estimate).map((term) => docxParagraph(term, { bullet: true })));
  if (sections.has("additionalTerms")) {
    children.push(
      docxParagraph("Additional terms or exclusions:"),
      ...additionalTerms.map((term) => docxParagraph(term.description, { bullet: true })),
    );
  }
  if (sections.has("prevailingWage")) {
    children.push(
      docxHeading("Prevailing Wage"),
      docxParagraph(estimate.prevailingWageStatement.trim()),
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
    signatureTable(options),
  );
  return children;
}

export async function generateEstimateDocx(
  estimate: EstimateDetail,
  options: EstimateRenderOptions = {},
): Promise<Uint8Array> {
  const document = new Document({
    creator: "Perfect Shade Web Estimate Builder",
    title: `${estimate.documentType} - ${estimate.projectName}`,
    description: "Perfect Shade client proposal",
    styles: {
      default: {
        document: { run: { font: "Aptos", size: 21, color: BLACK } },
      },
    },
    numbering: {
      config: [{
        reference: "perfect-shade-terms",
        levels: [{
          level: 0,
          format: LevelFormat.BULLET,
          text: "•",
          alignment: AlignmentType.LEFT,
          suffix: LevelSuffix.SPACE,
          style: {
            run: { font: "Arial", size: 14 },
            paragraph: { indent: { left: 317, hanging: 180 } },
          },
        }],
      }],
    },
    sections: [{
      properties: {
        page: {
          margin: {
            top: 864,
            right: 1008,
            bottom: 936,
            left: 1008,
            header: 720,
            footer: 720,
          },
          size: { width: 12240, height: 15840 },
        },
      },
      footers: {
        default: new Footer({ children: [new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [docxText(`Perfect Shade LLC | ${estimate.documentType}`, { color: "666666", size: 18 })],
        })] }),
      },
      children: documentChildren(estimate, options),
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
  boldItalic: PDFFont;
  y: number;
};

const PDF_WIDTH = 612;
const PDF_HEIGHT = 792;
const PDF_MARGIN_X = 50.4;
const PDF_TOP_MARGIN = 43.2;
const PDF_BOTTOM_MARGIN = 46.8;

function newPdfPage(context: Omit<PdfContext, "page" | "y">): PdfContext {
  return {
    ...context,
    page: context.document.addPage([PDF_WIDTH, PDF_HEIGHT]),
    y: PDF_HEIGHT - PDF_TOP_MARGIN,
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
  if (context.y - height >= PDF_BOTTOM_MARGIN + 18) return context;
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
  const size = options.size ?? 10.5;
  const indent = options.indent ?? 0;
  const lineHeight = size * 1.28;
  const lines = wrapPdfText(text, font, size, PDF_WIDTH - (2 * PDF_MARGIN_X) - indent);
  context = ensurePdfSpace(context, lines.length * lineHeight + (options.spacingAfter ?? 4));
  for (const line of lines) {
    context.page.drawText(line, {
      x: PDF_MARGIN_X + indent,
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
  context.y -= 5;
  return pdfText(context, text, {
    color: rgb(0.122, 0.306, 0.475),
    font: context.boldItalic,
    size: 13.5,
    spacingAfter: 1,
  });
}

function pdfBullet(context: PdfContext, text: string): PdfContext {
  return pdfText(context, `•  ${text}`, { indent: 12, spacingAfter: 0 });
}

function pdfHeadingWithBody(context: PdfContext, heading: string, body: string): PdfContext {
  const lineHeight = 10.5 * 1.28;
  const bodyLines = wrapPdfText(
    body,
    context.regular,
    10.5,
    PDF_WIDTH - (2 * PDF_MARGIN_X),
  );
  context = ensurePdfSpace(context, 24 + (bodyLines.length * lineHeight) + 4);
  context = pdfHeading(context, heading);
  return pdfText(context, body);
}

function pdfTable(
  context: PdfContext,
  rows: readonly Readonly<{
    bold?: boolean;
    left: string;
    right: string;
    kind?: "header" | "info" | "strong" | "light";
  }>[],
): PdfContext {
  const width = PDF_WIDTH - (2 * PDF_MARGIN_X);
  const leftWidth = width * 0.5;
  for (const row of rows) {
    const font = row.kind === "header" || row.kind === "strong" || row.bold
      ? context.bold
      : context.regular;
    const leftFont = row.kind === "info" ? context.bold : font;
    const leftLines = wrapPdfText(row.left, leftFont, 10.5, leftWidth - 10);
    const rightLines = wrapPdfText(row.right, font, 10.5, width - leftWidth - 10);
    const height = Math.max(leftLines.length, rightLines.length) * 12 + 3;
    context = ensurePdfSpace(context, height);
    const fill = row.kind === "header"
      ? rgb(0.122, 0.306, 0.475)
      : row.kind === "strong"
        ? rgb(0.741, 0.843, 0.933)
        : row.kind === "light"
          ? rgb(0.867, 0.922, 0.969)
          : rgb(1, 1, 1);
    context.page.drawRectangle({
      x: PDF_MARGIN_X,
      y: context.y - height,
      width,
      height,
      color: fill,
      borderColor: rgb(0.624, 0.729, 0.816),
      borderWidth: 0.75,
    });
    if (row.kind === "info") {
      context.page.drawRectangle({
        x: PDF_MARGIN_X + 0.75,
        y: context.y - height + 0.75,
        width: leftWidth - 1.125,
        height: height - 1.5,
        color: rgb(0.867, 0.922, 0.969),
      });
    }
    context.page.drawLine({
      start: { x: PDF_MARGIN_X + leftWidth, y: context.y },
      end: { x: PDF_MARGIN_X + leftWidth, y: context.y - height },
      color: rgb(0.624, 0.729, 0.816),
      thickness: 0.75,
    });
    const color = row.kind === "header" ? rgb(1, 1, 1) : rgb(0.05, 0.05, 0.05);
    const leftColor = row.kind === "info" ? rgb(0.122, 0.306, 0.475) : color;
    leftLines.forEach((line, index) => context.page.drawText(line, {
      x: PDF_MARGIN_X + 5,
      y: context.y - 11 - (index * 12),
      size: 10.5,
      font: leftFont,
      color: leftColor,
    }));
    rightLines.forEach((line, index) => context.page.drawText(line, {
      x: PDF_MARGIN_X + width - 5 - font.widthOfTextAtSize(line, 10.5),
      y: context.y - 11 - (index * 12),
      size: 10.5,
      font,
      color,
    }));
    context.y -= height;
  }
  context.y -= 5;
  return context;
}

function drawRightAlignedPdfText(
  context: PdfContext,
  text: string,
  y: number,
  font: PDFFont,
  size: number,
) {
  context.page.drawText(text, {
    x: PDF_WIDTH - PDF_MARGIN_X - font.widthOfTextAtSize(text, size),
    y,
    size,
    font,
    color: rgb(0.122, 0.306, 0.475),
  });
}

function pdfProposalHeader(context: PdfContext, estimate: EstimateDetail): PdfContext {
  const size = 9;
  const lineHeight = 10.8;
  const metadata = [
    "Bid No.",
    estimate.estimateNumber.trim(),
    "Prepared",
    estimate.estimateDate.trim(),
    "Valid Through",
    estimate.validThrough.trim(),
    "Status",
    lifecycleLabel(estimate),
  ];
  const lineCount = Math.max(COMPANY_BLOCK.length, metadata.length);
  context = ensurePdfSpace(context, lineCount * lineHeight + 4);
  COMPANY_BLOCK.forEach((line, index) => {
    context.page.drawText(line, {
      x: PDF_MARGIN_X,
      y: context.y - size - (index * lineHeight),
      size,
      font: context.regular,
      color: rgb(0.07, 0.07, 0.07),
    });
  });
  metadata.forEach((line, index) => {
    if (!line) return;
    drawRightAlignedPdfText(
      context,
      line,
      context.y - size - (index * lineHeight),
      context.bold,
      size,
    );
  });
  context.y -= lineCount * lineHeight + 4;
  return context;
}

function pdfSignatureBlock(
  context: PdfContext,
  companySignature?: Awaited<ReturnType<PDFDocument["embedPng"]>>,
): PdfContext {
  const blockHeight = 102;
  context = ensurePdfSpace(context, blockHeight);
  const top = context.y;
  const rightX = PDF_MARGIN_X + ((PDF_WIDTH - (2 * PDF_MARGIN_X)) / 2) + 6;
  context.page.drawText("Perfect Shade Authorized Signature", {
    x: PDF_MARGIN_X,
    y: top - 11,
    size: 10.5,
    font: context.bold,
    color: rgb(0.122, 0.306, 0.475),
  });
  context.page.drawText("Sheri Brannan", {
    x: PDF_MARGIN_X,
    y: top - 24,
    size: 10.5,
    font: context.bold,
    color: rgb(0.122, 0.306, 0.475),
  });
  context.page.drawText("Authorized Signature", {
    x: rightX,
    y: top - 11,
    size: 10.5,
    font: context.bold,
    color: rgb(0.122, 0.306, 0.475),
  });
  if (companySignature) {
    context.page.drawImage(companySignature, {
      x: PDF_MARGIN_X,
      y: top - 76,
      width: 187.2,
      height: 48.4,
    });
  }
  const leftEnd = PDF_MARGIN_X + 174;
  const rightEnd = PDF_WIDTH - PDF_MARGIN_X;
  const lineY = top - 80;
  context.page.drawLine({
    start: { x: PDF_MARGIN_X, y: lineY },
    end: { x: leftEnd, y: lineY },
    thickness: 0.7,
    color: rgb(0.15, 0.15, 0.15),
  });
  context.page.drawLine({
    start: { x: rightX, y: lineY },
    end: { x: rightEnd, y: lineY },
    thickness: 0.7,
    color: rgb(0.15, 0.15, 0.15),
  });
  context.page.drawText("Date:", {
    x: PDF_MARGIN_X,
    y: top - 94,
    size: 10.5,
    font: context.regular,
  });
  context.page.drawText("Date:", {
    x: rightX,
    y: top - 94,
    size: 10.5,
    font: context.bold,
    color: rgb(0.122, 0.306, 0.475),
  });
  context.y -= blockHeight;
  return context;
}

export function buildEstimatePdfText(estimate: EstimateDetail): readonly string[] {
  const sections = new Set(visibleProposalSections(estimate));
  const scopeItems = nonblankRows(estimate.scopeItems);
  const pricingLines = nonblankRows(estimate.pricingLines);
  const alternatePricingLines = nonblankRows(estimate.alternatePricingLines);
  const addenda = nonblankRows(estimate.addenda);
  const additionalTerms = nonblankRows(estimate.terms);
  return [
    "PERFECT SHADE LLC",
    estimate.documentType.toUpperCase(),
    ...COMPANY_BLOCK,
    "Bid No.",
    estimate.estimateNumber,
    "Prepared",
    estimate.estimateDate,
    "Valid Through",
    estimate.validThrough,
    "Status",
    lifecycleLabel(estimate),
    "Bid Information",
    "Bid Due",
    estimate.bidDue,
    "Project",
    estimate.projectName,
    "Location",
    estimate.projectLocation,
    "Architect",
    estimate.preparedFor,
    "Owner",
    estimate.contactInformation,
    "Scope of Work",
    `Provide all materials and installation for window coverings for ${estimate.projectName.trim() || "this project"}.`,
    ...scopeItems.map((item) => item.description),
    ...(sections.has("addenda")
      ? [
          "Addenda Acknowledgement",
          "Perfect Shade has acknowledged the following addenda:",
          ...addenda.map((item) => item.description),
        ]
      : []),
    "Pricing",
    "Description",
    "Amount",
    ...pricingLines.flatMap((line) => [line.description, displayMoney(line.amountMinor)]),
    "Subtotal",
    displayMoney(estimate.totals.subtotalMinor),
    ...(BigInt(estimate.totals.salesTaxMinor) !== 0n
      ? [`Sales Tax (${estimate.taxRatePercent}%)`, displayMoney(estimate.totals.salesTaxMinor)]
      : []),
    "Total",
    displayMoney(estimate.totals.totalMinor),
    "Required Deposit",
    displayMoney(estimate.totals.requiredDepositMinor),
    "Balance Due",
    displayMoney(estimate.totals.remainingBalanceMinor),
    ...(sections.has("alternates")
      ? [
          "Alternate Pricing",
          ...alternatePricingLines.flatMap((line) => [line.description, displayMoney(line.amountMinor)]),
          "Alternate Total",
          displayMoney(estimate.totals.alternateTotalMinor),
          "Alternate pricing is provided for consideration only and is not included in the base bid total unless accepted in writing.",
        ]
      : []),
    "Terms",
    ...coreTerms(estimate),
    ...(sections.has("additionalTerms")
      ? ["Additional terms or exclusions:", ...additionalTerms.map((term) => term.description)]
      : []),
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
    "Perfect Shade Authorized Signature",
    "Sheri Brannan",
    "Authorized Signature",
    "Date:",
    `Perfect Shade LLC | ${estimate.documentType}`,
  ];
}

export async function generateEstimatePdf(
  estimate: EstimateDetail,
  generatedAt: Date,
  options: EstimateRenderOptions = {},
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
  const boldItalic = await document.embedFont(StandardFonts.HelveticaBoldOblique);
  const companySignature = options.companySignaturePng
    ? await document.embedPng(options.companySignaturePng)
    : undefined;
  let context = newPdfPage({ document, regular, bold, italic, boldItalic });
  const sections = new Set(visibleProposalSections(estimate));
  const scopeItems = nonblankRows(estimate.scopeItems);
  const pricingLines = nonblankRows(estimate.pricingLines);
  const alternatePricingLines = nonblankRows(estimate.alternatePricingLines);
  const addenda = nonblankRows(estimate.addenda);
  const additionalTerms = nonblankRows(estimate.terms);

  context = pdfText(context, "PERFECT SHADE LLC", {
    color: rgb(0.122, 0.306, 0.475), font: bold, size: 23, spacingAfter: 0,
  });
  context = pdfText(context, estimate.documentType.toUpperCase(), {
    color: rgb(0.314, 0.314, 0.314), font: bold, size: 11.5, spacingAfter: 5,
  });
  context = pdfProposalHeader(context, estimate);
  context = pdfHeading(context, "Bid Information");
  context = pdfTable(context, [
    { left: "Bid Due", right: estimate.bidDue, kind: "info" },
    { left: "Project", right: estimate.projectName, kind: "info" },
    { left: "Location", right: estimate.projectLocation, kind: "info" },
    { left: "Architect", right: estimate.preparedFor, kind: "info" },
    { left: "Owner", right: estimate.contactInformation, kind: "info" },
  ]);
  context = pdfHeading(context, "Scope of Work");
  context = pdfText(context, `Provide all materials and installation for window coverings for ${estimate.projectName.trim() || "this project"}.`);
  for (const item of scopeItems) context = pdfBullet(context, item.description);
  if (sections.has("addenda")) {
    context = pdfHeading(context, "Addenda Acknowledgement");
    context = pdfText(context, "Perfect Shade has acknowledged the following addenda:");
    for (const item of addenda) context = pdfBullet(context, item.description);
  }
  context = pdfHeading(context, "Pricing");
  context = pdfTable(context, [
    { left: "Description", right: "Amount", kind: "header" },
    ...pricingLines.map((line) => ({ left: line.description, right: displayMoney(line.amountMinor) })),
    { left: "Subtotal", right: displayMoney(estimate.totals.subtotalMinor), kind: "strong" },
    ...(BigInt(estimate.totals.salesTaxMinor) !== 0n
      ? [{ left: `Sales Tax (${estimate.taxRatePercent}%)`, right: displayMoney(estimate.totals.salesTaxMinor) }]
      : []),
    { left: "Total", right: displayMoney(estimate.totals.totalMinor), kind: "strong" },
    { left: "Required Deposit", right: displayMoney(estimate.totals.requiredDepositMinor), kind: "light" },
    { left: "Balance Due", right: displayMoney(estimate.totals.remainingBalanceMinor), kind: "light", bold: true },
  ]);
  if (sections.has("alternates")) {
    context = pdfHeading(context, "Alternate Pricing");
    context = pdfTable(context, [
      { left: "Description", right: "Amount", kind: "header" },
      ...alternatePricingLines.map((line) => ({ left: line.description, right: displayMoney(line.amountMinor) })),
      { left: "Alternate Total", right: displayMoney(estimate.totals.alternateTotalMinor), kind: "strong" },
    ]);
    context = pdfText(context, "Alternate pricing is provided for consideration only and is not included in the base bid total unless accepted in writing.");
  }
  context = pdfHeading(context, "Terms");
  for (const term of coreTerms(estimate)) context = pdfBullet(context, term);
  if (sections.has("additionalTerms")) {
    context = pdfText(context, "Additional terms or exclusions:");
    for (const term of additionalTerms) context = pdfBullet(context, term.description);
  }
  if (sections.has("prevailingWage")) {
    context = pdfHeadingWithBody(
      context,
      "Prevailing Wage",
      estimate.prevailingWageStatement.trim(),
    );
  }
  for (const [heading, body] of [
    ["Measurement Readiness", MEASUREMENT_READINESS_TEXT],
    ["Craftsmanship Warranty", CRAFTSMANSHIP_WARRANTY_TEXT],
    ["Company Qualifications", COMPANY_QUALIFICATIONS_TEXT],
  ] as const) {
    context = pdfHeadingWithBody(context, heading, body);
  }
  if (sections.has("projectNotes")) {
    context = pdfHeadingWithBody(
      context,
      "Project Notes",
      `Project Notes: ${estimate.projectNotes}`,
    );
  }
  context = ensurePdfSpace(context, 24 + 30 + 102);
  context = pdfHeadingWithBody(
    context,
    "Authorization and Acceptance",
    "By signing below, the client acknowledges acceptance of the scope, pricing, and terms described in this proposal.",
  );
  context = pdfSignatureBlock(context, companySignature);

  document.getPages().forEach((page) => {
    const footer = `Perfect Shade LLC | ${estimate.documentType}`;
    page.drawText(footer, {
      x: (PDF_WIDTH - regular.widthOfTextAtSize(footer, 8)) / 2,
      y: 24,
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
  options: EstimateRenderOptions = {},
): Promise<GeneratedEstimateDocument> {
  let bytes: Uint8Array;
  if (type === "docx") bytes = await generateEstimateDocx(estimate, options);
  else if (type === "pdf") bytes = await generateEstimatePdf(estimate, generatedAt, options);
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
