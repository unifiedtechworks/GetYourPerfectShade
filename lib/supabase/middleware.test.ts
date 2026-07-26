import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { updateSession } from "./middleware";

describe("updateSession without auth configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("fails closed for protected application routes", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const response = await updateSession(new NextRequest("https://example.com/app/account"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://example.com/sign-in?error=configuration"
    );
  });

  it("continues to serve public routes", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "");
    const response = await updateSession(new NextRequest("https://example.com/about"));
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();
  });
});
