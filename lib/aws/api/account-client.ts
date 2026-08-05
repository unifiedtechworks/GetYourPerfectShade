import { getCognitoConfiguration } from "../../auth/cognito/config";
import type {
  AccountApiErrorBody,
  InviteTeamMemberRequest,
  InviteTeamMemberResponse,
  TeamListResponse,
  UpdateProfileRequest,
  UpdateProfileResponse,
  UpdateTeamMemberResponse,
  UpdateTeamMemberRoleRequest,
} from "./account-contracts";

type Fetch = typeof fetch;

export class AccountApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly requestId: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "AccountApiError";
  }
}

export type MembershipStatusAction = "disable" | "enable" | "remove";

function configuredBaseUrl(): string {
  const value = getCognitoConfiguration()?.apiBaseUrl;
  if (!value) {
    throw new AccountApiError(
      "account_api_not_configured",
      "Account administration is not configured.",
      "",
      503,
    );
  }
  return value.replace(/\/$/, "");
}

async function parseResponse<T>(response: Response): Promise<T> {
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const apiError = body as AccountApiErrorBody | null;
    throw new AccountApiError(
      apiError?.error?.code ?? "account_api_error",
      apiError?.error?.message ?? "The account service is unavailable.",
      apiError?.error?.requestId ?? "",
      response.status,
    );
  }
  return body as T;
}

export function createAccountApiClient(options: Readonly<{
  accessToken: string;
  baseUrl?: string;
  fetchImpl?: Fetch;
}>) {
  const baseUrl = (options.baseUrl ?? configuredBaseUrl()).replace(/\/$/, "");
  const fetchImpl = options.fetchImpl ?? fetch;
  const headers = {
    authorization: `Bearer ${options.accessToken}`,
    "content-type": "application/json",
  };

  async function post<T>(path: string, body: unknown = {}) {
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return parseResponse<T>(response);
  }

  return {
    async listTeam() {
      const response = await fetchImpl(`${baseUrl}/v1/account/team`, {
        headers: { authorization: headers.authorization },
        cache: "no-store",
      });
      return parseResponse<TeamListResponse>(response);
    },

    invite(request: InviteTeamMemberRequest) {
      return post<InviteTeamMemberResponse>(
        "/v1/account/team/invitations",
        request,
      );
    },

    changeRole(membershipId: string, request: UpdateTeamMemberRoleRequest) {
      return post<UpdateTeamMemberResponse>(
        `/v1/account/team/${encodeURIComponent(membershipId)}/role`,
        request,
      );
    },

    changeStatus(membershipId: string, action: MembershipStatusAction) {
      return post<UpdateTeamMemberResponse>(
        `/v1/account/team/${encodeURIComponent(membershipId)}/${action}`,
      );
    },

    updateProfile(request: UpdateProfileRequest) {
      return post<UpdateProfileResponse>("/v1/account/profile", request);
    },
  };
}
