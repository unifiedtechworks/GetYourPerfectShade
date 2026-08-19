import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ValidatedSession } from "./session";

const { refreshSession, sessionFromCookies } = vi.hoisted(() => ({
  refreshSession: vi.fn(),
  sessionFromCookies: vi.fn(),
}));

vi.mock("./client", () => ({ refreshSession }));
vi.mock("./session", () => ({ sessionFromCookies }));

import { updateAuthSession } from "./middleware";

describe("Cognito protected-route enforcement", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  function withConfiguration() {
    vi.stubEnv("NEXT_PUBLIC_AWS_REGION", "us-west-2");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_ID", "us-west-2_example");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID", "client-123");
  }

  function withoutConfiguration() {
    vi.stubEnv("NEXT_PUBLIC_AWS_REGION", "");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_ID", "");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID", "");
  }

  it.each(["/app", "/app/account", "/app/estimates", "/app/estimates/new"])(
    "fails closed without Cognito configuration for %s",
    async (path) => {
      withoutConfiguration();
      const response = await updateAuthSession(new NextRequest(`https://example.com${path}`));
      expect(response.status).toBe(307);
      expect(response.headers.get("location")).toContain("/sign-in?error=configuration");
      expect(response.headers.get("location")).toContain(`next=${encodeURIComponent(path)}`);
    },
  );

  it("does not block a public route when AWS development resources are absent", async () => {
    withoutConfiguration();
    const response = await updateAuthSession(new NextRequest("https://example.com/about"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });

  it("passes refreshed session cookies to the same downstream protected request", async () => {
    withConfiguration();
    const refreshedSession = {
      accessToken: "new-access-token",
      idToken: "new-id-token",
      accessClaims: { sub: "staff-subject" },
      identity: { sub: "staff-subject", emailVerified: true },
    } satisfies ValidatedSession;
    sessionFromCookies
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(refreshedSession);
    refreshSession.mockResolvedValue({
      AccessToken: "new-access-token",
      IdToken: "new-id-token",
      ExpiresIn: 3600,
    });
    const request = new NextRequest("https://example.com/app/account", {
      headers: {
        cookie: "ps_cognito_access=expired; ps_cognito_id=expired; ps_cognito_refresh=refresh+/=; preference=compact",
      },
    });

    const response = await updateAuthSession(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      "ps_cognito_access=new-access-token",
    );
    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      "ps_cognito_id=new-id-token",
    );
    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      "ps_cognito_refresh=refresh+/=",
    );
    expect(response.headers.get("x-middleware-request-cookie")).toContain(
      "preference=compact",
    );
    expect(response.headers.getSetCookie().join(";")).not.toContain("expired");
  });
});
