import { afterEach, describe, expect, it, vi } from "vitest";
import { getCognitoConfiguration } from "./config";

describe("Cognito environment configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is absent until all authentication identifiers exist", () => {
    vi.stubEnv("NEXT_PUBLIC_AWS_REGION", "us-west-2");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_ID", "");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID", "client-123");
    expect(getCognitoConfiguration()).toBeNull();
  });

  it("derives the approved issuer and normalizes endpoint URLs", () => {
    vi.stubEnv("NEXT_PUBLIC_AWS_REGION", "us-west-2");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_ID", "us-west-2_example");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID", "client-123");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com/");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.example.com/");
    expect(getCognitoConfiguration()).toMatchObject({
      issuer: "https://cognito-idp.us-west-2.amazonaws.com/us-west-2_example",
      apiBaseUrl: "https://api.example.com",
      siteUrl: "https://app.example.com",
    });
  });
});
