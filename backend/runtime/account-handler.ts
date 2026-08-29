import {
  createAccountHandler,
  type AccountHttpApiEvent,
  type AccountHttpApiResponse,
} from "../account";
import { CognitoStaffIdentityDirectory } from "../account/cognito-admin";
import {
  CloudWatchOperationalTelemetry,
  type OperationalTelemetry,
} from "../shared/operational-telemetry";
import { RdsDataDatabase } from "../shared/rds-data";

type AccountHandler = ReturnType<typeof createAccountHandler>;

function safeErrorResponse(requestId: string): AccountHttpApiResponse {
  return {
    statusCode: 500,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify({
      error: {
        code: "internal_error",
        message: "The account service could not complete the request.",
        requestId,
      },
    }),
  };
}

export function createAccountRuntimeHandler(options: Readonly<{
  accountHandler?: AccountHandler;
  handlerFactory?: (telemetry: OperationalTelemetry) => AccountHandler;
  telemetry?: OperationalTelemetry;
  clock?: () => number;
}> = {}) {
  const telemetry = options.telemetry ?? new CloudWatchOperationalTelemetry("account");
  const clock = options.clock ?? Date.now;
  let accountHandler = options.accountHandler;

  function getHandler(): AccountHandler {
    accountHandler ??= (options.handlerFactory ?? ((runtimeTelemetry) =>
      createAccountHandler(
        new RdsDataDatabase(),
        new CognitoStaffIdentityDirectory(),
        runtimeTelemetry,
      )))(telemetry);
    return accountHandler;
  }

  return async function runtimeHandler(
    event: AccountHttpApiEvent,
  ): Promise<AccountHttpApiResponse> {
    const startedAt = clock();
    try {
      return await getHandler()(event);
    } catch {
      const response = safeErrorResponse(event.requestContext.requestId);
      telemetry.recordOperation({
        operation: "initialize_account_runtime",
        route: event.routeKey ?? "GET /v1/account",
        requestId: event.requestContext.requestId,
        durationMs: clock() - startedAt,
        statusCode: 500,
        outcome: "failure",
        errorCode: "internal_error",
        errorCategory: "unexpected",
      });
      return response;
    }
  };
}

export const handler = createAccountRuntimeHandler();
