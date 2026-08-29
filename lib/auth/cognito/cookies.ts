import type { AuthenticationResultType } from "@aws-sdk/client-cognito-identity-provider";

export const AUTH_COOKIES = {
  access: "ps_cognito_access",
  id: "ps_cognito_id",
  refresh: "ps_cognito_refresh",
  challenge: "ps_cognito_challenge",
} as const;

export const AUTH_CHALLENGE_MAX_AGE_SECONDS = 10 * 60;

export type AuthChallengeKind =
  | "new-password"
  | "mfa-setup"
  | "mfa-setup-verification"
  | "software-token-mfa";

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

export type AuthChallenge = {
  version: 1;
  kind: AuthChallengeKind;
  username: string;
  session: string;
  next: string;
  issuedAt: number;
};

export function createChallenge(
  value: Omit<AuthChallenge, "version" | "issuedAt">,
  now = Date.now(),
): AuthChallenge {
  return { version: 1, ...value, issuedAt: now };
}

export function encodeChallenge(value: AuthChallenge) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeChallenge(
  value: string | undefined,
  now = Date.now(),
): AuthChallenge | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (
      typeof parsed === "object" && parsed !== null &&
      (parsed as AuthChallenge).version === 1 &&
      ["new-password", "mfa-setup", "mfa-setup-verification", "software-token-mfa"]
        .includes((parsed as AuthChallenge).kind) &&
      typeof (parsed as AuthChallenge).username === "string" &&
      (parsed as AuthChallenge).username.length > 0 &&
      typeof (parsed as AuthChallenge).session === "string" &&
      (parsed as AuthChallenge).session.length > 0 &&
      typeof (parsed as AuthChallenge).next === "string" &&
      (parsed as AuthChallenge).next.startsWith("/") &&
      !(parsed as AuthChallenge).next.startsWith("//") &&
      !(parsed as AuthChallenge).next.includes("\\") &&
      typeof (parsed as AuthChallenge).issuedAt === "number" &&
      Number.isFinite((parsed as AuthChallenge).issuedAt) &&
      (parsed as AuthChallenge).issuedAt <= now + 5_000 &&
      now - (parsed as AuthChallenge).issuedAt <= AUTH_CHALLENGE_MAX_AGE_SECONDS * 1_000
    ) return parsed as AuthChallenge;
  } catch {
    // Treat malformed or stale challenge cookies as absent.
  }
  return null;
}

export function challengeCookieOptions() {
  return options(AUTH_CHALLENGE_MAX_AGE_SECONDS);
}
