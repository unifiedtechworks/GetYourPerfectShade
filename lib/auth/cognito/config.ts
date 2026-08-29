export type CognitoConfiguration = {
  environmentName: "development" | "production";
  region: string;
  userPoolId: string;
  clientId: string;
  issuer: string;
  jwksUrl: URL;
  apiBaseUrl?: string;
  siteUrl: string;
};

function normalizedUrl(
  value: string | undefined,
  production: boolean,
  originOnly = false,
): string | null | undefined {
  const normalized = value?.trim();
  if (!normalized) return undefined;
  try {
    const parsed = new URL(normalized);
    if (
      !["http:", "https:"].includes(parsed.protocol) ||
      parsed.username || parsed.password || parsed.search || parsed.hash ||
      (originOnly && parsed.pathname !== "/") ||
      (production && (
        parsed.protocol !== "https:" ||
        parsed.hostname === "localhost" || parsed.hostname.endsWith(".localhost")
      ))
    ) return null;
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

export function getCognitoConfiguration(): CognitoConfiguration | null {
  const environmentName = process.env.NEXT_PUBLIC_PERFECT_SHADE_ENVIRONMENT?.trim() ||
    "development";
  if (environmentName !== "development" && environmentName !== "production") return null;
  const region = process.env.NEXT_PUBLIC_AWS_REGION?.trim();
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID?.trim();
  const clientId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID?.trim();
  if (!region || !userPoolId || !clientId || !userPoolId.startsWith(`${region}_`)) return null;

  const production = environmentName === "production";
  const apiBaseUrl = normalizedUrl(process.env.NEXT_PUBLIC_API_BASE_URL, production);
  const siteUrl = normalizedUrl(process.env.NEXT_PUBLIC_SITE_URL, production, true);
  if (apiBaseUrl === null || siteUrl === null) return null;
  if (production && (!apiBaseUrl || !siteUrl)) return null;

  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  return {
    environmentName,
    region,
    userPoolId,
    clientId,
    issuer,
    jwksUrl: new URL(`${issuer}/.well-known/jwks.json`),
    apiBaseUrl,
    siteUrl: siteUrl ?? "http://localhost:3000",
  };
}
