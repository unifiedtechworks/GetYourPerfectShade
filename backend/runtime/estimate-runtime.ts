import {
  createEstimateHandlers,
  type HttpApiEvent,
  type HttpApiResponse,
} from "../estimates";
import {
  pendingDocumentStaleAfterMsFromEnvironment,
} from "../estimates/phase4-service";
import {
  CloudWatchOperationalTelemetry,
  type DocumentMetricType,
  type OperationalTelemetry,
} from "../shared/operational-telemetry";

type RoutedHttpApiEvent = HttpApiEvent & Readonly<{
  requestContext: HttpApiEvent["requestContext"] & Readonly<{
    http?: Readonly<{ method?: string; path?: string }>;
  }>;
}>;

type EstimateHandlers = ReturnType<typeof createEstimateHandlers>;
type HandlerName = keyof EstimateHandlers;

type ResolvedRoute = Readonly<{
  operation: string;
  route: string;
  handlerName: HandlerName | null;
}>;

function resolvedRoute(method: string | undefined, path: string | undefined): ResolvedRoute {
  if (method === "GET" && path === "/v1/estimates") {
    return { operation: "list_estimates", route: "GET /v1/estimates", handlerName: "list" };
  }
  if (method === "POST" && path === "/v1/estimates/drafts") {
    return { operation: "create_draft", route: "POST /v1/estimates/drafts", handlerName: "createDraft" };
  }
  if (/^\/v1\/estimates\/[^/]+\/documents$/.test(path ?? "")) {
    if (method === "GET") {
      return {
        operation: "list_documents",
        route: "GET /v1/estimates/{estimateId}/documents",
        handlerName: "listDocuments",
      };
    }
    if (method === "POST") {
      return {
        operation: "generate_document",
        route: "POST /v1/estimates/{estimateId}/documents",
        handlerName: "generateDocument",
      };
    }
  }
  if (
    method === "GET" &&
    /^\/v1\/estimates\/[^/]+\/documents\/[^/]+\/download$/.test(path ?? "")
  ) {
    return {
      operation: "download_document",
      route: "GET /v1/estimates/{estimateId}/documents/{documentId}/download",
      handlerName: "downloadDocument",
    };
  }
  if (method === "POST" && /^\/v1\/estimates\/[^/]+\/issue$/.test(path ?? "")) {
    return {
      operation: "issue_estimate",
      route: "POST /v1/estimates/{estimateId}/issue",
      handlerName: "issue",
    };
  }
  if (method === "POST" && /^\/v1\/estimates\/[^/]+\/duplicate$/.test(path ?? "")) {
    return {
      operation: "duplicate_estimate",
      route: "POST /v1/estimates/{estimateId}/duplicate",
      handlerName: "duplicate",
    };
  }
  if (method === "POST" && /^\/v1\/estimates\/[^/]+\/revisions$/.test(path ?? "")) {
    return {
      operation: "create_revision",
      route: "POST /v1/estimates/{estimateId}/revisions",
      handlerName: "createRevision",
    };
  }
  if (/^\/v1\/estimates\/[^/]+$/.test(path ?? "")) {
    if (method === "GET") {
      return {
        operation: "get_estimate",
        route: "GET /v1/estimates/{estimateId}",
        handlerName: "get",
      };
    }
    if (method === "PUT") {
      return {
        operation: "update_draft",
        route: "PUT /v1/estimates/{estimateId}",
        handlerName: "updateDraft",
      };
    }
  }
  return { operation: "unknown_estimate_route", route: "unknown_route", handlerName: null };
}

function safeErrorResponse(requestId: string): HttpApiResponse {
  return {
    statusCode: 500,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify({
      error: {
        code: "internal_error",
        message: "The estimate service could not complete the request.",
        requestId,
      },
    }),
  };
}

function notFoundResponse(requestId: string): HttpApiResponse {
  return {
    statusCode: 404,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify({
      error: {
        code: "route_not_found",
        message: "The requested route does not exist.",
        requestId,
      },
    }),
  };
}

function errorCode(response: HttpApiResponse): string | undefined {
  if (response.statusCode < 400) return undefined;
  try {
    const body = JSON.parse(response.body) as {
      error?: { code?: unknown };
    };
    return typeof body.error?.code === "string"
      ? body.error.code
      : "internal_error";
  } catch {
    return "internal_error";
  }
}

function requestedDocumentType(event: RoutedHttpApiEvent): DocumentMetricType | undefined {
  try {
    const value = JSON.parse(event.body ?? "") as { type?: unknown };
    return value.type === "docx" || value.type === "pdf" || value.type === "json"
      ? value.type
      : undefined;
  } catch {
    return undefined;
  }
}

function pendingDocumentHealth(response: HttpApiResponse, nowMs: number) {
  try {
    const body = JSON.parse(response.body) as {
      data?: readonly Readonly<{
        state?: unknown;
        createdAt?: unknown;
        isStale?: unknown;
      }>[];
    };
    const pending = (body.data ?? []).filter((item) => item.state === "pending");
    const ages = pending
      .map((item) => typeof item.createdAt === "string"
        ? Math.max(0, Math.floor((nowMs - Date.parse(item.createdAt)) / 1000))
        : 0)
      .filter(Number.isFinite);
    return {
      pendingCount: pending.length,
      staleCount: pending.filter((item) => item.isStale === true).length,
      oldestAgeSeconds: ages.length > 0 ? Math.max(...ages) : 0,
    };
  } catch {
    return { pendingCount: 0, staleCount: 0, oldestAgeSeconds: 0 };
  }
}

export function createEstimateRuntimeHandler(options: Readonly<{
  handlers?: EstimateHandlers;
  handlerFactory?: (pendingDocumentStaleAfterMs: number) => EstimateHandlers;
  telemetry?: OperationalTelemetry;
  clock?: () => number;
  pendingDocumentStaleAfterMs?: number;
}> = {}) {
  const telemetry = options.telemetry ?? new CloudWatchOperationalTelemetry("estimate");
  const clock = options.clock ?? Date.now;
  let handlers = options.handlers;
  let pendingDocumentStaleAfterMs = options.pendingDocumentStaleAfterMs;

  function getPendingDocumentStaleAfterMs(): number {
    pendingDocumentStaleAfterMs ??= pendingDocumentStaleAfterMsFromEnvironment();
    return pendingDocumentStaleAfterMs;
  }

  function getHandlers(): EstimateHandlers {
    if (handlers) return handlers;
    const factory = options.handlerFactory;
    if (!factory) {
      throw new Error("Estimate runtime dependencies are unavailable.");
    }
    handlers = factory(getPendingDocumentStaleAfterMs());
    return handlers;
  }

  return async function runtimeHandler(
    event: RoutedHttpApiEvent,
  ): Promise<HttpApiResponse> {
    const startedAt = clock();
    const route = resolvedRoute(
      event.requestContext.http?.method,
      event.requestContext.http?.path,
    );
    const documentType = route.operation === "generate_document"
      ? requestedDocumentType(event)
      : undefined;
    let response: HttpApiResponse;
    let unexpected = false;
    try {
      response = route.handlerName
        ? await getHandlers()[route.handlerName](event)
        : notFoundResponse(event.requestContext.requestId);
    } catch {
      unexpected = true;
      response = safeErrorResponse(event.requestContext.requestId);
    }

    const code = errorCode(response);
    const outcome = response.statusCode < 400 ? "success" : "failure";
    telemetry.recordOperation({
      operation: route.operation,
      route: route.route,
      requestId: event.requestContext.requestId,
      durationMs: clock() - startedAt,
      statusCode: response.statusCode,
      outcome,
      ...(code ? { errorCode: code } : {}),
      ...(outcome === "failure"
        ? {
            errorCategory: unexpected || code === "internal_error"
              ? "unexpected" as const
              : "handled" as const,
          }
        : {}),
      estimateId: event.pathParameters?.estimateId,
      documentId: event.pathParameters?.documentId,
      documentType,
    });

    if (route.operation === "list_documents" && response.statusCode === 200) {
      telemetry.recordPendingDocuments({
        route: route.route,
        requestId: event.requestContext.requestId,
        ...pendingDocumentHealth(response, clock()),
      });
    }
    return response;
  };
}
