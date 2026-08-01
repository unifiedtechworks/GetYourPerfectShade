import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { updateAuthSession } from "./middleware";

describe("Cognito protected-route enforcement", () => {
  afterEach(() => vi.unstubAllEnvs());

  function withoutConfiguration() {
    vi.stubEnv("NEXT_PUBLIC_AWS_REGION", "");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_ID", "");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID", "");
  }

  it.each(["/app", "/app/account", "/app/estimates/new"])(
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
});
