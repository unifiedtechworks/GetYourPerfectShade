import { describe, expect, it } from "vitest";
import { AccountApiError, createAccountApiClient } from "./account-client";

describe("account API client", () => {
  it("sends protected team commands without actor or organization identity", async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      return new Response(JSON.stringify({
        data: {
          membershipId: "22222222-2222-4222-8222-222222222222",
          role: "staff",
          status: "active",
          recovered: false,
          alreadyComplete: false,
        },
      }), { status: 201, headers: { "content-type": "application/json" } });
    };
    await createAccountApiClient({
      accessToken: "test-access-token",
      baseUrl: "https://api.example.invalid",
      fetchImpl,
    }).invite({ email: "staff@example.invalid", role: "staff" });

    expect(requests[0].url).toBe("https://api.example.invalid/v1/account/team/invitations");
    expect(requests[0].init?.method).toBe("POST");
    const body = JSON.parse(String(requests[0].init?.body));
    expect(body).toEqual({ email: "staff@example.invalid", role: "staff" });
    expect(body).not.toHaveProperty("organizationId");
    expect(body).not.toHaveProperty("actorId");
    expect(body).not.toHaveProperty("currentRole");
  });

  it("returns only the stable secret-safe API error contract", async () => {
    const client = createAccountApiClient({
      accessToken: "test-access-token",
      baseUrl: "https://api.example.invalid",
      fetchImpl: async () => new Response(JSON.stringify({
        error: {
          code: "cognito_unavailable",
          message: "The staff identity service is unavailable.",
          requestId: "request-1",
        },
      }), { status: 503, headers: { "content-type": "application/json" } }),
    });
    await expect(client.listTeam()).rejects.toEqual(expect.objectContaining({
      name: "AccountApiError",
      code: "cognito_unavailable",
      requestId: "request-1",
    } satisfies Partial<AccountApiError>));
  });
});
