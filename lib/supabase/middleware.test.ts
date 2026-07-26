import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "./middleware";

describe("updateSession without auth configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each(["/app/account", "/app/estimates", "/app/estimates/new"])(
    "fails closed for protected application route %s",
    async (path) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const response = await updateSession(new NextRequest(`https://example.com${path}`));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/sign-in?error=configuration"
    );
    }
  );

  it("continues to serve public routes", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const response = await updateSession(new NextRequest("https://example.com/about"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
