import { describe, expect, it, vi } from "vitest";
import type { createEstimateHandlers, HttpApiResponse } from "../estimates";
import type {
  OperationObservation,
  OperationalTelemetry,
  PendingDocumentObservation,
} from "../shared/operational-telemetry";
import { createEstimateRuntimeHandler } from "./estimate-runtime";

const ESTIMATE_ID = "22222222-2222-4222-8222-222222222222";
const DOCUMENT_ID = "33333333-3333-4333-8333-333333333333";

class FakeTelemetry implements OperationalTelemetry {
  readonly operations: OperationObservation[] = [];
  readonly pending: PendingDocumentObservation[] = [];
  recordOperation(observation: OperationObservation) {
    this.operations.push(observation);
  }
  recordPendingDocuments(observation: PendingDocumentObservation) {
    this.pending.push(observation);
  }
}

function response(statusCode: number, body: unknown): HttpApiResponse {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

function fakeHandlers(result: HttpApiResponse) {
  const handler = vi.fn(async () => result);
  return {
    createDraft: handler,
    createRevision: handler,
    downloadDocument: handler,
    duplicate: handler,
    generateDocument: handler,
    get: handler,
    issue: handler,
    list: handler,
    listDocuments: handler,
    updateDraft: handler,
  } as unknown as ReturnType<typeof createEstimateHandlers>;
}

function event(
  method: string,
  path: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    body: null,
    headers: {},
    pathParameters: { estimateId: ESTIMATE_ID },
    requestContext: {
      requestId: "request-1",
      http: { method, path },
    },
    ...overrides,
  };
}

describe("estimate runtime operational boundary", () => {
  it("converts unexpected initialization errors into safe responses and telemetry", async () => {
    const telemetry = new FakeTelemetry();
    const runtime = createEstimateRuntimeHandler({
      handlerFactory: () => {
        throw new Error("password=never-log SQL select customer_content");
      },
      telemetry,
      clock: () => 100,
      pendingDocumentStaleAfterMs: 900_000,
    });
    const result = await runtime(event("GET", "/v1/estimates"));
    expect(result.statusCode).toBe(500);
    expect(result.body).toContain("internal_error");
    expect(result.body).not.toContain("never-log");
    expect(telemetry.operations).toEqual([
      expect.objectContaining({
        operation: "list_estimates",
        outcome: "failure",
        errorCode: "internal_error",
        errorCategory: "unexpected",
      }),
    ]);
    expect(JSON.stringify(telemetry.operations)).not.toContain("never-log");
  });

  it("classifies handled lifecycle failures by stable operation and code", async () => {
    const telemetry = new FakeTelemetry();
    const runtime = createEstimateRuntimeHandler({
      handlers: fakeHandlers(response(400, {
        error: {
          code: "estimate_incomplete",
          message: "Complete the estimate before issuing it.",
          requestId: "request-1",
        },
      })),
      telemetry,
      clock: () => 100,
    });
    await runtime(event("POST", `/v1/estimates/${ESTIMATE_ID}/issue`));
    expect(telemetry.operations[0]).toMatchObject({
      operation: "issue_estimate",
      route: "POST /v1/estimates/{estimateId}/issue",
      outcome: "failure",
      errorCode: "estimate_incomplete",
      errorCategory: "handled",
      estimateId: ESTIMATE_ID,
    });
  });

  it("records document type and approved identifiers without response content", async () => {
    const telemetry = new FakeTelemetry();
    const runtime = createEstimateRuntimeHandler({
      handlers: fakeHandlers(response(201, { data: { state: "ready" } })),
      telemetry,
      clock: () => 100,
    });
    await runtime(event(
      "POST",
      `/v1/estimates/${ESTIMATE_ID}/documents`,
      { body: JSON.stringify({ type: "pdf", customerNotes: "do not log" }) },
    ));
    expect(telemetry.operations[0]).toMatchObject({
      operation: "generate_document",
      outcome: "success",
      estimateId: ESTIMATE_ID,
      documentType: "pdf",
    });
    expect(JSON.stringify(telemetry.operations)).not.toContain("customerNotes");
    expect(JSON.stringify(telemetry.operations)).not.toContain("do not log");
  });

  it("emits pending-document health when history is listed", async () => {
    const telemetry = new FakeTelemetry();
    const runtime = createEstimateRuntimeHandler({
      handlers: fakeHandlers(response(200, {
        data: [
          {
            id: DOCUMENT_ID,
            state: "pending",
            createdAt: "2026-08-29T11:00:00.000Z",
            isStale: true,
          },
          {
            state: "pending",
            createdAt: "2026-08-29T11:59:00.000Z",
            isStale: false,
          },
        ],
      })),
      telemetry,
      clock: () => Date.parse("2026-08-29T12:00:00.000Z"),
    });
    await runtime(event("GET", `/v1/estimates/${ESTIMATE_ID}/documents`));
    expect(telemetry.pending).toEqual([{
      route: "GET /v1/estimates/{estimateId}/documents",
      requestId: "request-1",
      pendingCount: 2,
      staleCount: 1,
      oldestAgeSeconds: 3600,
    }]);
  });
});
