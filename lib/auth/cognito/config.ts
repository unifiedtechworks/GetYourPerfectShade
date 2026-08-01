export type CognitoConfiguration = {
  region: string;
  userPoolId: string;
  clientId: string;
  issuer: string;
  jwksUrl: URL;
  apiBaseUrl?: string;
  siteUrl: string;
};

export function getCognitoConfiguration(): CognitoConfiguration | null {
  const region = process.env.NEXT_PUBLIC_AWS_REGION?.trim();
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID?.trim();
  const clientId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID?.trim();
  if (!region || !userPoolId || !clientId) return null;

  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  return {
    region,
    userPoolId,
    clientId,
    issuer,
    jwksUrl: new URL(`${issuer}/.well-known/jwks.json`),
    apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, ""),
    siteUrl: process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000",
  };
}
