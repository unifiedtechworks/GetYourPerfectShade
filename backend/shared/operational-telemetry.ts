export type ApplicationService = "account" | "estimate";
export type DocumentMetricType = "docx" | "pdf" | "json";

export type OperationObservation = Readonly<{
  operation: string;
  route: string;
  requestId: string;
  durationMs: number;
  statusCode: number;
  outcome: "success" | "failure";
  errorCode?: string;
  errorCategory?: "handled" | "unexpected";
  estimateId?: string;
  documentId?: string;
  documentType?: DocumentMetricType;
}>;

export type PendingDocumentObservation = Readonly<{
  route: string;
  requestId: string;
  pendingCount: number;
  staleCount: number;
  oldestAgeSeconds: number;
}>;

export interface OperationalTelemetry {
  recordOperation(observation: OperationObservation): void;
  recordPendingDocuments(observation: PendingDocumentObservation): void;
}

type Metric = Readonly<{
  name: string;
  unit: "Count" | "Milliseconds" | "Seconds";
  value: number;
}>;

const IDENTIFIER_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_LABEL_PATTERN = /^[A-Za-z0-9_./:{} -]+$/;
const SAFE_REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

function safeLabel(value: string, fallback: string): string {
  return value.length <= 160 && SAFE_LABEL_PATTERN.test(value)
    ? value
    : fallback;
}

function safeRequestId(value: string): string {
  return SAFE_REQUEST_ID_PATTERN.test(value) ? value : "unknown";
}

function safeIdentifier(value: string | undefined): string | undefined {
  return value && IDENTIFIER_PATTERN.test(value) ? value : undefined;
}

function boundedNumber(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function operationMetrics(observation: OperationObservation): readonly Metric[] {
  const metrics: Metric[] = [
    {
      name: observation.outcome === "success"
        ? "OperationSuccess"
        : "OperationFailure",
      unit: "Count",
      value: 1,
    },
    {
      name: "OperationDurationMs",
      unit: "Milliseconds",
      value: boundedNumber(observation.durationMs),
    },
  ];
  if (observation.operation === "generate_document") {
    metrics.push({
      name: observation.outcome === "success"
        ? "DocumentGenerationSuccess"
        : "DocumentGenerationFailure",
      unit: "Count",
      value: 1,
    });
    metrics.push({
      name: "DocumentGenerationDurationMs",
      unit: "Milliseconds",
      value: boundedNumber(observation.durationMs),
    });
  }
  if (observation.outcome === "failure") {
    const lifecycleMetric = {
      issue_estimate: "IssueFailure",
      create_revision: "RevisionFailure",
      duplicate_estimate: "DuplicateFailure",
    }[observation.operation];
    if (lifecycleMetric) {
      metrics.push({ name: lifecycleMetric, unit: "Count", value: 1 });
    }
  }
  return metrics;
}

export class CloudWatchOperationalTelemetry implements OperationalTelemetry {
  constructor(
    private readonly service: ApplicationService,
    private readonly sink: (line: string) => void = (line) => {
      process.stdout.write(`${line}\n`);
    },
    private readonly clock: () => number = Date.now,
  ) {}

  private write(value: unknown): void {
    try {
      this.sink(JSON.stringify(value));
    } catch {
      // Observability must never alter the application response path.
    }
  }

  private metric(operation: string, metrics: readonly Metric[], documentType?: DocumentMetricType) {
    const dimensions = documentType
      ? ["Service", "Operation", "DocumentType"]
      : ["Service", "Operation"];
    this.write({
      _aws: {
        Timestamp: this.clock(),
        CloudWatchMetrics: [{
          Namespace: "PerfectShade/Application",
          Dimensions: [dimensions],
          Metrics: metrics.map(({ name, unit }) => ({ Name: name, Unit: unit })),
        }],
      },
      Service: this.service,
      Operation: operation,
      ...(documentType ? { DocumentType: documentType } : {}),
      ...Object.fromEntries(metrics.map(({ name, value }) => [name, value])),
    });
  }

  private serviceMetric(metrics: readonly Metric[]): void {
    this.write({
      _aws: {
        Timestamp: this.clock(),
        CloudWatchMetrics: [{
          Namespace: "PerfectShade/Application",
          Dimensions: [["Service"]],
          Metrics: metrics.map(({ name, unit }) => ({ Name: name, Unit: unit })),
        }],
      },
      Service: this.service,
      ...Object.fromEntries(metrics.map(({ name, value }) => [name, value])),
    });
  }

  recordOperation(observation: OperationObservation): void {
    const operation = safeLabel(observation.operation, "unknown_operation");
    const route = safeLabel(observation.route, "unknown_route");
    const durationMs = boundedNumber(observation.durationMs);
    const estimateId = safeIdentifier(observation.estimateId);
    const documentId = safeIdentifier(observation.documentId);
    const errorCode = observation.errorCode
      ? safeLabel(observation.errorCode, "internal_error")
      : undefined;
    this.write({
      timestamp: new Date(this.clock()).toISOString(),
      eventType: "application_operation",
      service: this.service,
      operation,
      route,
      requestId: safeRequestId(observation.requestId),
      outcome: observation.outcome,
      durationMs,
      statusCode: observation.statusCode,
      ...(errorCode ? { errorCode } : {}),
      ...(observation.errorCategory
        ? { errorCategory: observation.errorCategory }
        : {}),
      ...(estimateId ? { estimateId } : {}),
      ...(documentId ? { documentId } : {}),
      ...(observation.documentType
        ? { documentType: observation.documentType }
        : {}),
    });
    this.metric(
      operation,
      operationMetrics({ ...observation, durationMs }),
      observation.documentType,
    );
    if (observation.errorCategory === "unexpected") {
      this.serviceMetric([
        { name: "UnexpectedHandlerError", unit: "Count", value: 1 },
      ]);
    }
  }

  recordPendingDocuments(observation: PendingDocumentObservation): void {
    const operation = "list_documents";
    const pendingCount = boundedNumber(observation.pendingCount);
    const staleCount = boundedNumber(observation.staleCount);
    const oldestAgeSeconds = boundedNumber(observation.oldestAgeSeconds);
    this.write({
      timestamp: new Date(this.clock()).toISOString(),
      eventType: "pending_document_health",
      service: this.service,
      operation,
      route: safeLabel(observation.route, "unknown_route"),
      requestId: safeRequestId(observation.requestId),
      pendingDocumentCount: pendingCount,
      stalePendingDocumentCount: staleCount,
      oldestPendingDocumentAgeSeconds: oldestAgeSeconds,
    });
    this.metric(operation, [
      { name: "PendingDocumentCount", unit: "Count", value: pendingCount },
      { name: "StalePendingDocumentCount", unit: "Count", value: staleCount },
      {
        name: "OldestPendingDocumentAgeSeconds",
        unit: "Seconds",
        value: oldestAgeSeconds,
      },
    ]);
  }
}
