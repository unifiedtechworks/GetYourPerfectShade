import type {
  CreateEstimateDraftRequest,
  CreateEstimateDraftResponse,
  CopyEstimateResponse,
  EstimateApiErrorBody,
  EstimateDocumentDownloadResponse,
  EstimateDocumentType,
  GenerateEstimateDocumentResponse,
  GetEstimateResponse,
  IssueEstimateResponse,
  ListEstimateDocumentsResponse,
  ListEstimatesResponse,
  UpdateEstimateDraftRequest,
  UpdateEstimateDraftResponse,
} from "./estimate-contracts";
import { getCognitoConfiguration } from "../../auth/cognito/config";

type Fetch = typeof fetch;

export class EstimateApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly requestId: string,
    readonly status: number,
    readonly fields?: Readonly<Record<string, string>>,
  ) {
    super(message);
    this.name = "EstimateApiError";
  }
}

export type EstimateApiClient = Readonly<{
  createDraft(
    request: CreateEstimateDraftRequest,
    idempotencyKey: string,
  ): Promise<CreateEstimateDraftResponse>;
  list(options?: Readonly<{
    cursor?: string;
    limit?: number;
  }>): Promise<ListEstimatesResponse>;
  get(estimateId: string): Promise<GetEstimateResponse>;
  issue(
    estimateId: string,
    idempotencyKey: string,
  ): Promise<IssueEstimateResponse>;
  duplicate(
    estimateId: string,
    idempotencyKey: string,
  ): Promise<CopyEstimateResponse>;
  createRevision(
    estimateId: string,
    idempotencyKey: string,
  ): Promise<CopyEstimateResponse>;
  generateDocument(
    estimateId: string,
    type: EstimateDocumentType,
    idempotencyKey: string,
  ): Promise<GenerateEstimateDocumentResponse>;
  listDocuments(estimateId: string): Promise<ListEstimateDocumentsResponse>;
  getDocumentDownload(
    estimateId: string,
    documentId: string,
  ): Promise<EstimateDocumentDownloadResponse>;
  updateDraft(
    estimateId: string,
    request: UpdateEstimateDraftRequest,
  ): Promise<UpdateEstimateDraftResponse>;
}>;

function configuredBaseUrl(): string {
  const value = getCognitoConfiguration()?.apiBaseUrl;
  if (!value) {
    throw new EstimateApiError(
      "estimate_api_not_configured",
      "Estimate storage is not configured.",
      "",
      503,
    );
  }
  return value.replace(/\/$/, "");
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const apiError = body as EstimateApiErrorBody | null;
    throw new EstimateApiError(
      apiError?.error?.code ?? "estimate_api_error",
      apiError?.error?.message ?? "The estimate service is unavailable.",
      apiError?.error?.requestId ?? "",
      response.status,
      apiError?.error?.fields,
    );
  }
  return body as T;
}

export function createEstimateApiClient(options: Readonly<{
  accessToken: string;
  baseUrl?: string;
  fetchImpl?: Fetch;
}>): EstimateApiClient {
  const baseUrl = (options.baseUrl ?? configuredBaseUrl()).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const authorization = `Bearer ${options.accessToken}`;

  return {
    async createDraft(request, idempotencyKey) {
      const response = await fetchImpl(`${baseUrl}/v1/estimates/drafts`, {
        method: "POST",
        headers: {
          authorization,
          "content-type": "application/json",
          "idempotency-key": idempotencyKey,
        },
        body: JSON.stringify(request),
        cache: "no-store",
      });
      return parseResponse<CreateEstimateDraftResponse>(response);
    },

    async list(options = {}) {
      const query = new URLSearchParams();
      if (options.cursor) query.set("cursor", options.cursor);
      if (options.limit !== undefined) query.set("limit", String(options.limit));
      const suffix = query.size > 0 ? `?${query}` : "";
      const response = await fetchImpl(`${baseUrl}/v1/estimates${suffix}`, {
        headers: { authorization },
        cache: "no-store",
      });
      return parseResponse<ListEstimatesResponse>(response);
    },

    async get(estimateId) {
      const response = await fetchImpl(
        `${baseUrl}/v1/estimates/${encodeURIComponent(estimateId)}`,
        {
          headers: { authorization },
          cache: "no-store",
        },
      );
      return parseResponse<GetEstimateResponse>(response);
    },

    async updateDraft(estimateId, request) {
      const response = await fetchImpl(
        `${baseUrl}/v1/estimates/${encodeURIComponent(estimateId)}`,
        {
          method: "PUT",
          headers: {
            authorization,
            "content-type": "application/json",
          },
          body: JSON.stringify(request),
          cache: "no-store",
        },
      );
      return parseResponse<UpdateEstimateDraftResponse>(response);
    },

    async issue(estimateId, idempotencyKey) {
      const response = await fetchImpl(
        `${baseUrl}/v1/estimates/${encodeURIComponent(estimateId)}/issue`,
        {
          method: "POST",
          headers: { authorization, "idempotency-key": idempotencyKey },
          cache: "no-store",
        },
      );
      return parseResponse<IssueEstimateResponse>(response);
    },

    async duplicate(estimateId, idempotencyKey) {
      const response = await fetchImpl(
        `${baseUrl}/v1/estimates/${encodeURIComponent(estimateId)}/duplicate`,
        {
          method: "POST",
          headers: { authorization, "idempotency-key": idempotencyKey },
          cache: "no-store",
        },
      );
      return parseResponse<CopyEstimateResponse>(response);
    },

    async createRevision(estimateId, idempotencyKey) {
      const response = await fetchImpl(
        `${baseUrl}/v1/estimates/${encodeURIComponent(estimateId)}/revisions`,
        {
          method: "POST",
          headers: { authorization, "idempotency-key": idempotencyKey },
          cache: "no-store",
        },
      );
      return parseResponse<CopyEstimateResponse>(response);
    },

    async generateDocument(estimateId, type, idempotencyKey) {
      const response = await fetchImpl(
        `${baseUrl}/v1/estimates/${encodeURIComponent(estimateId)}/documents`,
        {
          method: "POST",
          headers: {
            authorization,
            "content-type": "application/json",
            "idempotency-key": idempotencyKey,
          },
          body: JSON.stringify({ type }),
          cache: "no-store",
        },
      );
      return parseResponse<GenerateEstimateDocumentResponse>(response);
    },

    async listDocuments(estimateId) {
      const response = await fetchImpl(
        `${baseUrl}/v1/estimates/${encodeURIComponent(estimateId)}/documents`,
        { headers: { authorization }, cache: "no-store" },
      );
      return parseResponse<ListEstimateDocumentsResponse>(response);
    },

    async getDocumentDownload(estimateId, documentId) {
      const response = await fetchImpl(
        `${baseUrl}/v1/estimates/${encodeURIComponent(estimateId)}/documents/${encodeURIComponent(documentId)}/download`,
        { headers: { authorization }, cache: "no-store" },
      );
      return parseResponse<EstimateDocumentDownloadResponse>(response);
    },
  };
}
