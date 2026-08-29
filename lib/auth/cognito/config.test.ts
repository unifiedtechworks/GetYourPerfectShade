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
    vi.stubEnv("NEXT_PUBLIC_PERFECT_SHADE_ENVIRONMENT", "development");
    vi.stubEnv("NEXT_PUBLIC_AWS_REGION", "us-west-2");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_ID", "us-west-2_example");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID", "client-123");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.example.com/");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://app.example.com/");
    expect(getCognitoConfiguration()).toMatchObject({
      environmentName: "development",
      issuer: "https://cognito-idp.us-west-2.amazonaws.com/us-west-2_example",
      apiBaseUrl: "https://api.example.com",
      siteUrl: "https://app.example.com",
    });
  });

  it("requires complete HTTPS-isolated production endpoints", () => {
    vi.stubEnv("NEXT_PUBLIC_PERFECT_SHADE_ENVIRONMENT", "production");
    vi.stubEnv("NEXT_PUBLIC_AWS_REGION", "us-west-2");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_ID", "us-west-2_production");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID", "production-client");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.getyourperfectshade.com");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.getyourperfectshade.com");

    expect(getCognitoConfiguration()).toMatchObject({
      environmentName: "production",
      userPoolId: "us-west-2_production",
      clientId: "production-client",
      apiBaseUrl: "https://api.getyourperfectshade.com",
      siteUrl: "https://www.getyourperfectshade.com",
    });
  });

  it("fails closed for production localhost, missing API, or region-mismatched pools", () => {
    vi.stubEnv("NEXT_PUBLIC_PERFECT_SHADE_ENVIRONMENT", "production");
    vi.stubEnv("NEXT_PUBLIC_AWS_REGION", "us-west-2");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_ID", "us-west-2_production");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID", "production-client");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://localhost:3000");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "");
    expect(getCognitoConfiguration()).toBeNull();

    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.getyourperfectshade.com");
    vi.stubEnv("NEXT_PUBLIC_API_BASE_URL", "https://api.getyourperfectshade.com");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_ID", "us-east-1_wrong");
    expect(getCognitoConfiguration()).toBeNull();

    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_ID", "us-west-2_production");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.getyourperfectshade.com/unapproved-path");
    expect(getCognitoConfiguration()).toBeNull();
  });
});
