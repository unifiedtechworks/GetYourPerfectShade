import { describe, expect, it } from "vitest";
import { CloudWatchOperationalTelemetry } from "./operational-telemetry";

function parsedLines(lines: string[]): Record<string, unknown>[] {
  return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
}

describe("secret-safe operational telemetry", () => {
  it("emits a structured log and low-cardinality EMF for document generation", () => {
    const lines: string[] = [];
    const telemetry = new CloudWatchOperationalTelemetry(
      "estimate",
      (line) => lines.push(line),
      () => Date.parse("2026-08-29T12:00:00Z"),
    );
    telemetry.recordOperation({
      operation: "generate_document",
      route: "POST /v1/estimates/{estimateId}/documents",
      requestId: "request-1",
      durationMs: 123.6,
      statusCode: 201,
      outcome: "success",
      estimateId: "22222222-2222-4222-8222-222222222222",
      documentId: "33333333-3333-4333-8333-333333333333",
      documentType: "pdf",
    });

    const [log, metric] = parsedLines(lines);
    expect(log).toMatchObject({
      eventType: "application_operation",
      operation: "generate_document",
      outcome: "success",
      durationMs: 124,
      documentType: "pdf",
    });
    expect(metric).toMatchObject({
      Service: "estimate",
      Operation: "generate_document",
      DocumentType: "pdf",
      OperationSuccess: 1,
      DocumentGenerationSuccess: 1,
      DocumentGenerationDurationMs: 124,
    });
    expect(JSON.stringify(metric)).toContain("PerfectShade/Application");
  });

  it("records safe failure categories without accepting raw errors", () => {
    const lines: string[] = [];
    const telemetry = new CloudWatchOperationalTelemetry(
      "account",
      (line) => lines.push(line),
      () => 1,
    );
    telemetry.recordOperation({
      operation: "update_profile",
      route: "POST /v1/account/profile",
      requestId: "request-2",
      durationMs: 9,
      statusCode: 500,
      outcome: "failure",
      errorCode: "internal_error",
      errorCategory: "unexpected",
    });

    const serialized = lines.join("\n");
    expect(serialized).toContain("UnexpectedHandlerError");
    expect(serialized).toContain('"errorCode":"internal_error"');
    expect(serialized).not.toContain("stack");
    expect(serialized).not.toContain("sql");
    expect(serialized).not.toContain("password");
    const metrics = parsedLines(lines).filter((line) => line._aws);
    expect(metrics).toHaveLength(2);
    expect(metrics[1]).toMatchObject({
      Service: "account",
      UnexpectedHandlerError: 1,
    });
    expect(metrics[1]).not.toHaveProperty("Operation");
  });

  it("emits pending-document count, stale count, and oldest age", () => {
    const lines: string[] = [];
    const telemetry = new CloudWatchOperationalTelemetry(
      "estimate",
      (line) => lines.push(line),
      () => 1,
    );
    telemetry.recordPendingDocuments({
      route: "GET /v1/estimates/{estimateId}/documents",
      requestId: "request-3",
      pendingCount: 2,
      staleCount: 2,
      oldestAgeSeconds: 86_400,
    });
    const [log, metric] = parsedLines(lines);
    expect(log).toMatchObject({
      eventType: "pending_document_health",
      pendingDocumentCount: 2,
      stalePendingDocumentCount: 2,
      oldestPendingDocumentAgeSeconds: 86_400,
    });
    expect(metric).toMatchObject({
      PendingDocumentCount: 2,
      StalePendingDocumentCount: 2,
      OldestPendingDocumentAgeSeconds: 86_400,
    });
  });

  it("drops malformed identifiers and sanitizes correlation fields", () => {
    const lines: string[] = [];
    const telemetry = new CloudWatchOperationalTelemetry(
      "estimate",
      (line) => lines.push(line),
      () => 1,
    );
    telemetry.recordOperation({
      operation: "bad\noperation",
      route: "bad\nroute",
      requestId: "token\nsecret",
      durationMs: Number.NaN,
      statusCode: 500,
      outcome: "failure",
      errorCode: "bad\nerror",
      errorCategory: "unexpected",
      estimateId: "customer-content",
      documentId: "arn:aws:secretsmanager:example",
    });
    const [log] = parsedLines(lines);
    expect(log).toMatchObject({
      operation: "unknown_operation",
      route: "unknown_route",
      requestId: "unknown",
      durationMs: 0,
      errorCode: "internal_error",
    });
    expect(log).not.toHaveProperty("estimateId");
    expect(log).not.toHaveProperty("documentId");
  });
});
