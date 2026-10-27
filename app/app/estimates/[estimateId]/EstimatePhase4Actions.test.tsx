import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { EstimateDocumentRecord } from "@/lib/aws/api/estimate-contracts";
import { EstimatePhase4Actions } from "./EstimatePhase4Actions";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../phase4-actions", () => ({
  createRevisionAction: vi.fn(),
  duplicateEstimateAction: vi.fn(),
  generateEstimateDocumentAction: vi.fn(),
  getEstimateDocumentDownloadAction: vi.fn(),
  issueEstimateAction: vi.fn(),
}));
vi.mock("@/lib/estimates/idempotency", () => ({
  createEstimateCommandKeyTracker: () => ({
    keyFor: () => "test-command-key",
    clear: vi.fn(),
  }),
}));

function document(
  isStale: boolean,
  generatedAs: EstimateDocumentRecord["generatedAs"] = "draft",
  state: EstimateDocumentRecord["state"] = "pending",
): EstimateDocumentRecord {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    estimateId: "22222222-2222-4222-8222-222222222222",
    revisionNumber: "1",
    type: "pdf",
    generatedAs,
    state,
    filename: "proposal.pdf",
    contentType: "application/pdf",
    byteSize: null,
    checksumSha256: null,
    generatedAt: null,
    createdAt: "2026-08-29T11:00:00.000Z",
    isStale,
  };
}

function markup(
  documents: readonly EstimateDocumentRecord[],
  status: "draft" | "issued" = "draft",
): string {
  return renderToStaticMarkup(
    <EstimatePhase4Actions
      estimateId="22222222-2222-4222-8222-222222222222"
      status={status}
      revisionNumber="1"
      documents={documents}
      documentsUnavailable={false}
    />,
  );
}

describe("pending document warning", () => {
  it("identifies stale pending history and gives a non-destructive retry path", () => {
    const output = markup([document(true)]);
    expect(output).toContain("Pending (stale)");
    expect(output).toContain("Generate a new file to retry");
    expect(output).toContain("pending history record will remain unchanged");
  });

  it("does not warn while a pending generation is still within its timeout", () => {
    const output = markup([document(false)]);
    expect(output).toContain(">Pending<");
    expect(output).not.toContain("did not finish");
  });

  it("separates generated lifecycle from file state and keeps legacy honest", () => {
    const output = markup([
      document(false, "draft"),
      { ...document(false, "issued", "ready"), id: "issued-document" },
      { ...document(false, "unknown", "failed"), id: "legacy-document" },
    ]);
    expect(output).toContain("Generated As");
    expect(output).toContain("File State");
    expect(output).toContain("Draft");
    expect(output).toContain("Issued");
    expect(output).toContain("Unknown (legacy)");
    expect(output).toContain(">Pending<");
    expect(output).toContain(">Ready<");
    expect(output).toContain(">Failed<");
  });

  it("makes draft generation and explicit issuance distinct", () => {
    const output = markup([]);
    expect(output).toContain("Generate Draft DOCX");
    expect(output).toContain("Generate Draft PDF");
    expect(output).toContain("Export Draft JSON");
    expect(output).toContain("Issue estimate");
    expect(output).toContain("Generated files keep a DRAFT label");
  });

  it("switches issued revisions to finalized generation and Create revision", () => {
    const output = markup([], "issued");
    expect(output).toContain("Generate Issued PDF");
    expect(output).toContain("Create revision");
    expect(output).not.toContain("Issue estimate");
    expect(output).toContain("earlier draft files keep their original DRAFT label");
  });
});
