import type { TransactionDatabase } from "../shared/database";
import { AccountService, AccountServiceError } from "./service";

export type AccountHttpApiEvent = Readonly<{
  requestContext: Readonly<{
    requestId: string;
    authorizer?: Readonly<{
      jwt?: Readonly<{
        claims?: Readonly<Record<string, unknown>>;
      }>;
    }>;
  }>;
}>;

export type AccountHttpApiResponse = Readonly<{
  statusCode: number;
  headers: Readonly<Record<string, string>>;
  body: string;
}>;

function response(statusCode: number, body: unknown): AccountHttpApiResponse {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function errorResponse(error: unknown, requestId: string) {
  if (error instanceof AccountServiceError) {
    return response(error.status, {
      error: { code: error.code, message: error.message, requestId },
    });
  }
  return response(500, {
    error: {
      code: "internal_error",
      message: "The account service could not complete the request.",
      requestId,
    },
  });
}

export function createAccountHandler(database: TransactionDatabase) {
  const service = new AccountService(database);
  return async function accountHandler(
    event: AccountHttpApiEvent,
  ): Promise<AccountHttpApiResponse> {
    const requestId = event.requestContext.requestId;
    try {
      const subject = event.requestContext.authorizer?.jwt?.claims?.sub;
      if (typeof subject !== "string" || !subject) {
        throw new AccountServiceError(
          "authentication_required",
          "Authentication is required.",
          401,
        );
      }
      return response(200, await service.getAccount(subject));
    } catch (error) {
      return errorResponse(error, requestId);
    }
  };
}
