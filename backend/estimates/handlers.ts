import type { EstimateDatabase } from "./database";
import { EstimateServiceError } from "./errors";
import { EstimateService } from "./service";
import {
  validateCreateDraftRequest,
  validateEstimateId,
  validateIdempotencyKey,
  validateUpdateDraftRequest,
} from "./validation";

export type HttpApiEvent = Readonly<{
  body?: string | null;
  headers?: Readonly<Record<string, string | undefined>>;
  queryStringParameters?: Readonly<Record<string, string | undefined>> | null;
  pathParameters?: Readonly<Record<string, string | undefined>> | null;
  requestContext: Readonly<{
    requestId: string;
    authorizer?: Readonly<{
      jwt?: Readonly<{
        claims?: Readonly<Record<string, unknown>>;
      }>;
    }>;
  }>;
}>;

export type HttpApiResponse = Readonly<{
  statusCode: number;
  headers: Readonly<Record<string, string>>;
  body: string;
}>;

type Handler = (event: HttpApiEvent) => Promise<HttpApiResponse>;

function response(statusCode: number, body: unknown): HttpApiResponse {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function subject(event: HttpApiEvent): string {
  const value = event.requestContext.authorizer?.jwt?.claims?.sub;
  if (typeof value !== "string" || !value) {
    throw new EstimateServiceError(
      "authentication_required",
      "Authentication is required.",
      401,
    );
  }
  return value;
}

function header(
  headers: HttpApiEvent["headers"],
  name: string,
): string | undefined {
  const match = Object.entries(headers ?? {}).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return match?.[1];
}

function errorResponse(error: unknown, requestId: string): HttpApiResponse {
  if (error instanceof EstimateServiceError) {
    return response(error.status, {
      error: {
        code: error.code,
        message: error.message,
        requestId,
        ...(error.fields ? { fields: error.fields } : {}),
      },
    });
  }
  return response(500, {
    error: {
      code: "internal_error",
      message: "The estimate service could not complete the request.",
      requestId,
    },
  });
}

export function createEstimateHandlers(
  database: EstimateDatabase,
): Readonly<{
  createDraft: Handler;
  get: Handler;
  list: Handler;
  updateDraft: Handler;
}> {
  const service = new EstimateService(database);
  return {
    async createDraft(event) {
      const requestId = event.requestContext.requestId;
      try {
        const actorSubject = subject(event);
        let input: unknown;
        try {
          input = JSON.parse(event.body ?? "");
        } catch {
          throw new EstimateServiceError(
            "invalid_json",
            "The request body must be valid JSON.",
            400,
          );
        }
        const request = validateCreateDraftRequest(input);
        const idempotencyKey = validateIdempotencyKey(
          header(event.headers, "idempotency-key"),
        );
        const result = await service.createDraft(
          actorSubject,
          request,
          idempotencyKey,
          requestId,
        );
        return response(201, { data: result });
      } catch (error) {
        return errorResponse(error, requestId);
      }
    },

    async list(event) {
      const requestId = event.requestContext.requestId;
      try {
        const actorSubject = subject(event);
        const limitValue = event.queryStringParameters?.limit;
        const result = await service.list(actorSubject, {
          cursor: event.queryStringParameters?.cursor,
          limit: limitValue === undefined ? undefined : Number(limitValue),
        });
        return response(200, result);
      } catch (error) {
        return errorResponse(error, requestId);
      }
    },

    async get(event) {
      const requestId = event.requestContext.requestId;
      try {
        const actorSubject = subject(event);
        const estimateId = validateEstimateId(
          event.pathParameters?.estimateId,
        );
        return response(200, await service.get(actorSubject, estimateId));
      } catch (error) {
        return errorResponse(error, requestId);
      }
    },

    async updateDraft(event) {
      const requestId = event.requestContext.requestId;
      try {
        const actorSubject = subject(event);
        const estimateId = validateEstimateId(
          event.pathParameters?.estimateId,
        );
        let input: unknown;
        try {
          input = JSON.parse(event.body ?? "");
        } catch {
          throw new EstimateServiceError(
            "invalid_json",
            "The request body must be valid JSON.",
            400,
          );
        }
        const request = validateUpdateDraftRequest(input);
        return response(
          200,
          await service.updateDraft(
            actorSubject,
            estimateId,
            request,
            requestId,
          ),
        );
      } catch (error) {
        return errorResponse(error, requestId);
      }
    },
  };
}
