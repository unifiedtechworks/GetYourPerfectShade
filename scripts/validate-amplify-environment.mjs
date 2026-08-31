const REQUIRED_PUBLIC_VALUES = [
  "NEXT_PUBLIC_PERFECT_SHADE_ENVIRONMENT",
  "NEXT_PUBLIC_AWS_REGION",
  "NEXT_PUBLIC_COGNITO_USER_POOL_ID",
  "NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID",
  "NEXT_PUBLIC_API_BASE_URL",
  "NEXT_PUBLIC_SITE_URL",
];

export function validateAmplifyEnvironment(env) {
  const branch = env.AWS_BRANCH ?? "";
  if (branch !== "main") {
    if (env.PERFECT_SHADE_DEPLOYMENT_ENVIRONMENT === "production") {
      throw new Error("Production deployment variables may only be used by the protected main branch.");
    }
    return;
  }

  if (env.PERFECT_SHADE_DEPLOYMENT_ENVIRONMENT !== "production") {
    throw new Error("Amplify main requires a production-only branch override.");
  }
  if (env.PERFECT_SHADE_PRODUCTION_RELEASE_APPROVED !== "true") {
    throw new Error("Amplify main requires an explicit production release approval marker.");
  }
  for (const key of REQUIRED_PUBLIC_VALUES) {
    if (!env[key]) throw new Error(`Amplify main is missing ${key}.`);
  }
  if (env.NEXT_PUBLIC_PERFECT_SHADE_ENVIRONMENT !== "production") {
    throw new Error(
      "Amplify main requires NEXT_PUBLIC_PERFECT_SHADE_ENVIRONMENT=production.",
    );
  }
  for (const [expectedKey, publicKey] of [
    ["PERFECT_SHADE_EXPECTED_API_BASE_URL", "NEXT_PUBLIC_API_BASE_URL"],
    ["PERFECT_SHADE_EXPECTED_COGNITO_USER_POOL_ID", "NEXT_PUBLIC_COGNITO_USER_POOL_ID"],
    ["PERFECT_SHADE_EXPECTED_COGNITO_USER_POOL_CLIENT_ID", "NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID"],
  ]) {
    if (!env[expectedKey] || env[expectedKey] !== env[publicKey]) {
      throw new Error(`${publicKey} must match its production-only expected-value override.`);
    }
  }
  for (const [expectedKey, publicKey] of [
    ["PERFECT_SHADE_EXPECTED_API_BASE_URL", "NEXT_PUBLIC_API_BASE_URL"],
    ["PERFECT_SHADE_EXPECTED_COGNITO_USER_POOL_ID", "NEXT_PUBLIC_COGNITO_USER_POOL_ID"],
    ["PERFECT_SHADE_EXPECTED_COGNITO_USER_POOL_CLIENT_ID", "NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID"],
  ]) {
    if (!env[expectedKey] || env[expectedKey] !== env[publicKey]) {
      throw new Error(`${publicKey} must match its production-only expected-value override.`);
    }
  }
  if (env.NEXT_PUBLIC_AWS_REGION !== "us-west-2") {
    throw new Error("Amplify main must use the approved production backend region.");
  }
  for (const key of ["NEXT_PUBLIC_API_BASE_URL", "NEXT_PUBLIC_SITE_URL"]) {
    const url = new URL(env[key]);
    if (url.protocol !== "https:") throw new Error(`${key} must use HTTPS.`);
    if (url.hostname === "localhost" || url.hostname.startsWith("development.")) {
      throw new Error(`${key} must not reference development hosting.`);
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  validateAmplifyEnvironment(process.env);
  console.log("Amplify environment isolation check passed.");
}
import { pathToFileURL } from "node:url";
