import {
  createEstimateHandlers,
  type HttpApiEvent,
  type HttpApiResponse,
} from "../estimates";
import { RdsDataDatabase } from "../shared/rds-data";
import { S3EstimateDocumentStorage } from "../estimates/document-storage";
import sheriSignaturePng from "../estimates/assets/sheri_signature.pssig";
import { generateEstimateDocument } from "../../lib/estimates/document-output";

type RoutedHttpApiEvent = HttpApiEvent & Readonly<{
  requestContext: HttpApiEvent["requestContext"] & Readonly<{
    http?: Readonly<{ method?: string; path?: string }>;
  }>;
}>;

const handlers = createEstimateHandlers(
  new RdsDataDatabase(),
  new S3EstimateDocumentStorage(),
  process.env.ESTIMATE_INCLUDE_COMPANY_SIGNATURE === "true"
    ? (estimate, type, generatedAt) => generateEstimateDocument(
        estimate,
        type,
        generatedAt,
        { companySignaturePng: sheriSignaturePng },
      )
    : undefined,
);

export async function handler(event: RoutedHttpApiEvent): Promise<HttpApiResponse> {
  const method = event.requestContext.http?.method;
  const path = event.requestContext.http?.path;
  if (method === "GET" && path === "/v1/estimates") {
    return handlers.list(event);
  }
  if (method === "POST" && path === "/v1/estimates/drafts") {
    return handlers.createDraft(event);
  }
  if (/^\/v1\/estimates\/[^/]+\/documents$/.test(path ?? "")) {
    if (method === "GET") return handlers.listDocuments(event);
    if (method === "POST") return handlers.generateDocument(event);
  }
  if (/^\/v1\/estimates\/[^/]+\/documents\/[^/]+\/download$/.test(path ?? "") && method === "GET") {
    return handlers.downloadDocument(event);
  }
  if (/^\/v1\/estimates\/[^/]+\/issue$/.test(path ?? "") && method === "POST") {
    return handlers.issue(event);
  }
  if (/^\/v1\/estimates\/[^/]+\/duplicate$/.test(path ?? "") && method === "POST") {
    return handlers.duplicate(event);
  }
  if (/^\/v1\/estimates\/[^/]+\/revisions$/.test(path ?? "") && method === "POST") {
    return handlers.createRevision(event);
  }
  if (/^\/v1\/estimates\/[^/]+$/.test(path ?? "")) {
    if (method === "GET") return handlers.get(event);
    if (method === "PUT") return handlers.updateDraft(event);
  }
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
        requestId: event.requestContext.requestId,
      },
    }),
  };
}
