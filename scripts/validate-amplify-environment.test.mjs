import { describe, expect, it } from "vitest";
import { validateAmplifyEnvironment } from "./validate-amplify-environment.mjs";

const production = {
  AWS_BRANCH: "main",
  PERFECT_SHADE_DEPLOYMENT_ENVIRONMENT: "production",
  PERFECT_SHADE_PRODUCTION_RELEASE_APPROVED: "true",
  NEXT_PUBLIC_AWS_REGION: "us-west-2",
  NEXT_PUBLIC_COGNITO_USER_POOL_ID: "us-west-2_production",
  NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID: "production-client",
  NEXT_PUBLIC_API_BASE_URL: "https://production-api.example.invalid",
  NEXT_PUBLIC_SITE_URL: "https://www.getyourperfectshade.com",
  PERFECT_SHADE_EXPECTED_API_BASE_URL: "https://production-api.example.invalid",
  PERFECT_SHADE_EXPECTED_COGNITO_USER_POOL_ID: "us-west-2_production",
  PERFECT_SHADE_EXPECTED_COGNITO_USER_POOL_CLIENT_ID: "production-client",
};

describe("Amplify environment isolation", () => {
  it("accepts an explicitly approved production-only main configuration", () => {
    expect(() => validateAmplifyEnvironment(production)).not.toThrow();
  });

  it("rejects main when it would inherit development configuration", () => {
    expect(() => validateAmplifyEnvironment({
      ...production,
      PERFECT_SHADE_DEPLOYMENT_ENVIRONMENT: undefined,
      NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
    })).toThrow(/production-only branch override/);
  });

  it("rejects development hosts and production markers on non-main branches", () => {
    expect(() => validateAmplifyEnvironment({
      ...production,
      NEXT_PUBLIC_SITE_URL: "https://development.example.invalid",
    })).toThrow(/development hosting/);
    expect(() => validateAmplifyEnvironment({
      AWS_BRANCH: "development",
      PERFECT_SHADE_DEPLOYMENT_ENVIRONMENT: "production",
    })).toThrow(/protected main/);
  });
});
