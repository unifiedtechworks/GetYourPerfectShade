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

function document(isStale: boolean): EstimateDocumentRecord {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    estimateId: "22222222-2222-4222-8222-222222222222",
    revisionNumber: "1",
    type: "pdf",
    state: "pending",
    filename: "proposal.pdf",
    contentType: "application/pdf",
    byteSize: null,
    checksumSha256: null,
    generatedAt: null,
    createdAt: "2026-08-29T11:00:00.000Z",
    isStale,
  };
}

function markup(documents: readonly EstimateDocumentRecord[]): string {
  return renderToStaticMarkup(
    <EstimatePhase4Actions
      estimateId="22222222-2222-4222-8222-222222222222"
      status="draft"
      revisionNumber="1"
      documents={documents}
      documentsUnavailable={false}
    />,
  );
}

describe("pending document warning", () => {
  it("identifies stale pending history and gives a non-destructive retry path", () => {
    const output = markup([document(true)]);
    expect(output).toContain("pending (stale)");
    expect(output).toContain("Generate a new file to retry");
    expect(output).toContain("pending history record will remain unchanged");
  });

  it("does not warn while a pending generation is still within its timeout", () => {
    const output = markup([document(false)]);
    expect(output).toContain(">pending<");
    expect(output).not.toContain("did not finish");
  });
});
