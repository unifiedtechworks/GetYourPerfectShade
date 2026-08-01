import type { AuthenticationResultType } from "@aws-sdk/client-cognito-identity-provider";

export const AUTH_COOKIES = {
  access: "ps_cognito_access",
  id: "ps_cognito_id",
  refresh: "ps_cognito_refresh",
  challenge: "ps_cognito_challenge",
} as const;

type CookieOptions = {
  httpOnly: boolean;
  sameSite: "lax";
  secure: boolean;
  path: string;
  maxAge?: number;
};

export type CookieWriter = {
  set(name: string, value: string, options: CookieOptions): unknown;
};

function options(maxAge?: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    ...(maxAge === undefined ? {} : { maxAge }),
  };
}

export function setSessionCookies(
  writer: CookieWriter,
  result: AuthenticationResultType,
  existingRefreshToken?: string,
) {
  if (!result.AccessToken || !result.IdToken) {
    throw new Error("Cognito did not return a complete session.");
  }
  const sessionMaxAge = Math.max(60, result.ExpiresIn ?? 3600);
  writer.set(AUTH_COOKIES.access, result.AccessToken, options(sessionMaxAge));
  writer.set(AUTH_COOKIES.id, result.IdToken, options(sessionMaxAge));
  const refreshToken = result.RefreshToken ?? existingRefreshToken;
  if (refreshToken) writer.set(AUTH_COOKIES.refresh, refreshToken, options(60 * 60 * 24 * 30));
  writer.set(AUTH_COOKIES.challenge, "", options(0));
}

export function clearAuthCookies(writer: CookieWriter) {
  Object.values(AUTH_COOKIES).forEach((name) => writer.set(name, "", options(0)));
}

export type NewPasswordChallenge = { username: string; session: string; next: string };

export function encodeChallenge(value: NewPasswordChallenge) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeChallenge(value: string | undefined): NewPasswordChallenge | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (
      typeof parsed === "object" && parsed !== null &&
      typeof (parsed as NewPasswordChallenge).username === "string" &&
      typeof (parsed as NewPasswordChallenge).session === "string" &&
      typeof (parsed as NewPasswordChallenge).next === "string"
    ) return parsed as NewPasswordChallenge;
  } catch {
    // Treat malformed or stale challenge cookies as absent.
  }
  return null;
}

export function challengeCookieOptions() {
  return options(10 * 60);
}
