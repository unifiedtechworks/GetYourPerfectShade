import type { TransactionDatabase } from "../shared/database";
import {
  CognitoStaffIdentityDirectory,
  type StaffIdentityDirectory,
} from "./cognito-admin";
import { AccountService, AccountServiceError } from "./service";
import {
  CloudWatchOperationalTelemetry,
  type OperationalTelemetry,
} from "../shared/operational-telemetry";
import { TeamService } from "./team-service";

export type AccountHttpApiEvent = Readonly<{
  routeKey?: string;
  body?: string | null;
  pathParameters?: Readonly<Record<string, string | undefined>> | null;
  requestContext: Readonly<{
    requestId: string;
    http?: Readonly<{ method?: string; path?: string }>;
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

function subject(event: AccountHttpApiEvent): string {
  const value = event.requestContext.authorizer?.jwt?.claims?.sub;
  if (typeof value !== "string" || !value) {
    throw new AccountServiceError(
      "authentication_required",
      "Authentication is required.",
      401,
    );
  }
  return value;
}

function jsonObject(event: AccountHttpApiEvent): Record<string, unknown> {
  try {
    const value = JSON.parse(event.body ?? "") as unknown;
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      throw new Error("invalid");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new AccountServiceError(
      "invalid_json",
      "The request body must be a JSON object.",
      400,
    );
  }
}

function managedRole(value: unknown): "admin" | "staff" {
  if (value !== "admin" && value !== "staff") {
    throw new AccountServiceError(
      "target_role_forbidden",
      "Only admin or staff may be selected for staff administration.",
      403,
    );
  }
  return value;
}

function normalizedEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (
    email.length < 3 || email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new AccountServiceError(
      "invalid_email",
      "Enter a valid staff email address.",
      400,
    );
  }
  return email;
}

function membershipId(event: AccountHttpApiEvent): string {
  const value = event.pathParameters?.membershipId ?? "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AccountServiceError(
      "invalid_membership_id",
      "The membership identifier is invalid.",
      400,
    );
  }
  return value;
}

function displayName(value: unknown): string {
  const name = typeof value === "string" ? value.trim() : "";
  if (!name || name.length > 120) {
    throw new AccountServiceError(
      "invalid_display_name",
      "Display name must be between 1 and 120 characters.",
      400,
    );
  }
  return name;
}

function accountOperation(routeKey: string): string {
  const operations: Readonly<Record<string, string>> = {
    "GET /v1/account": "get_account",
    "GET /v1/account/team": "list_team",
    "POST /v1/account/team/invitations": "invite_team_member",
    "POST /v1/account/team/{membershipId}/role": "change_team_role",
    "POST /v1/account/team/{membershipId}/disable": "disable_team_member",
    "POST /v1/account/team/{membershipId}/enable": "enable_team_member",
    "POST /v1/account/team/{membershipId}/remove": "remove_team_member",
    "POST /v1/account/profile": "update_profile",
  };
  return operations[routeKey] ?? "unknown_account_route";
}

export function createAccountHandler(
  database: TransactionDatabase,
  directory: StaffIdentityDirectory = new CognitoStaffIdentityDirectory(),
  telemetry: OperationalTelemetry = new CloudWatchOperationalTelemetry("account"),
) {
  const service = new AccountService(database);
  const team = new TeamService(database, directory);
  return async function accountHandler(
    event: AccountHttpApiEvent,
  ): Promise<AccountHttpApiResponse> {
    const requestId = event.requestContext.requestId;
    const routeKey = event.routeKey ?? "GET /v1/account";
    const operation = accountOperation(routeKey);
    const startedAt = Date.now();
    const dispatch = async (): Promise<AccountHttpApiResponse> => {
      const actorSubject = subject(event);
      if (routeKey === "GET /v1/account") {
        return response(200, await service.getAccount(actorSubject));
      }
      if (routeKey === "GET /v1/account/team") {
        return response(200, await team.list(actorSubject));
      }
      if (routeKey === "POST /v1/account/team/invitations") {
        const input = jsonObject(event);
        const resumeExistingUser = input.resumeExistingUser ?? false;
        if (typeof resumeExistingUser !== "boolean") {
          throw new AccountServiceError(
            "invalid_recovery_option",
            "The recovery option is invalid.",
            400,
          );
        }
        const result = await team.invite(
          actorSubject,
          normalizedEmail(input.email),
          managedRole(input.role),
          requestId,
          resumeExistingUser,
        );
        return response(result.alreadyComplete ? 200 : 201, { data: result });
      }
      if (routeKey === "POST /v1/account/team/{membershipId}/role") {
        const input = jsonObject(event);
        return response(200, {
          data: await team.changeRole(
            actorSubject,
            membershipId(event),
            managedRole(input.role),
            requestId,
          ),
        });
      }
      const statusRoute = /^POST \/v1\/account\/team\/\{membershipId\}\/(disable|enable|remove)$/.exec(routeKey);
      if (statusRoute) {
        return response(200, {
          data: await team.changeStatus(
            actorSubject,
            membershipId(event),
            statusRoute[1] as "disable" | "enable" | "remove",
            requestId,
          ),
        });
      }
      if (routeKey === "POST /v1/account/profile") {
        const input = jsonObject(event);
        return response(200, {
          data: await team.updateProfile(
            actorSubject,
            displayName(input.displayName),
            requestId,
          ),
        });
      }
      return response(404, {
        error: {
          code: "route_not_found",
          message: "The account operation was not found.",
          requestId,
        },
      });
    };
    try {
      const result = await dispatch();
      const failed = result.statusCode >= 400;
      telemetry.recordOperation({
        operation,
        route: routeKey,
        requestId,
        durationMs: Date.now() - startedAt,
        statusCode: result.statusCode,
        outcome: failed ? "failure" : "success",
        ...(failed
          ? { errorCode: "route_not_found", errorCategory: "handled" as const }
          : {}),
      });
      return result;
    } catch (error) {
      const result = errorResponse(error, requestId);
      telemetry.recordOperation({
        operation,
        route: routeKey,
        requestId,
        durationMs: Date.now() - startedAt,
        statusCode: result.statusCode,
        outcome: "failure",
        errorCode: error instanceof AccountServiceError
          ? error.code
          : "internal_error",
        errorCategory: error instanceof AccountServiceError
          ? "handled"
          : "unexpected",
      });
      return result;
    }
  };
}
