import { describe, expect, it } from "vitest";
import type {
  OperationObservation,
  OperationalTelemetry,
  PendingDocumentObservation,
} from "../shared/operational-telemetry";
import { createAccountRuntimeHandler } from "./account-handler";

class FakeTelemetry implements OperationalTelemetry {
  readonly operations: OperationObservation[] = [];
  recordOperation(observation: OperationObservation) {
    this.operations.push(observation);
  }
  recordPendingDocuments(_observation: PendingDocumentObservation) {}
}

describe("account runtime operational boundary", () => {
  it("logs a safe unexpected category when runtime initialization fails", async () => {
    const telemetry = new FakeTelemetry();
    const runtime = createAccountRuntimeHandler({
      handlerFactory: () => {
        throw new Error("token=never-log-this database SQL");
      },
      telemetry,
      clock: () => 10,
    });
    const response = await runtime({
      routeKey: "GET /v1/account",
      requestContext: { requestId: "request-1" },
    });
    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("never-log-this");
    expect(telemetry.operations).toEqual([
      expect.objectContaining({
        operation: "initialize_account_runtime",
        outcome: "failure",
        errorCode: "internal_error",
        errorCategory: "unexpected",
      }),
    ]);
    expect(JSON.stringify(telemetry.operations)).not.toContain("never-log-this");
  });
});
