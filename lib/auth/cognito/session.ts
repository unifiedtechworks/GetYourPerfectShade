import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey, type JWTPayload } from "jose";
import type { CognitoConfiguration } from "./config";
import { getCognitoConfiguration } from "./config";
import { AUTH_COOKIES } from "./cookies";

const keySets = new Map<string, JWTVerifyGetKey>();

function keySet(configuration: CognitoConfiguration) {
  let value = keySets.get(configuration.issuer);
  if (!value) {
    value = createRemoteJWKSet(configuration.jwksUrl);
    keySets.set(configuration.issuer, value);
  }
  return value;
}

type VerificationKey = Parameters<typeof jwtVerify>[1];

export async function verifyAccessToken(
  token: string,
  configuration: CognitoConfiguration,
  verificationKey?: VerificationKey,
) {
  const { payload } = await jwtVerify(token, verificationKey ?? keySet(configuration), {
    issuer: configuration.issuer,
    clockTolerance: 5,
  });
  if (payload.token_use !== "access" || payload.client_id !== configuration.clientId || !payload.sub) {
    throw new Error("Invalid Cognito access-token claims.");
  }
  return payload;
}

export async function verifyIdToken(
  token: string,
  configuration: CognitoConfiguration,
  verificationKey?: VerificationKey,
) {
  const { payload } = await jwtVerify(token, verificationKey ?? keySet(configuration), {
    issuer: configuration.issuer,
    audience: configuration.clientId,
    clockTolerance: 5,
  });
  if (payload.token_use !== "id" || !payload.sub) {
    throw new Error("Invalid Cognito ID-token claims.");
  }
  return payload;
}

export type AuthenticatedIdentity = {
  sub: string;
  email?: string;
  emailVerified: boolean;
  username?: string;
};

export type ValidatedSession = {
  accessToken: string;
  idToken: string;
  accessClaims: JWTPayload;
  identity: AuthenticatedIdentity;
};

export async function validateSessionTokens(accessToken?: string, idToken?: string) {
  const configuration = getCognitoConfiguration();
  if (!configuration || !accessToken || !idToken) return null;
  try {
    const [accessClaims, idClaims] = await Promise.all([
      verifyAccessToken(accessToken, configuration),
      verifyIdToken(idToken, configuration),
    ]);
    if (accessClaims.sub !== idClaims.sub) return null;
    return {
      accessToken,
      idToken,
      accessClaims,
      identity: {
        sub: idClaims.sub!,
        email: typeof idClaims.email === "string" ? idClaims.email : undefined,
        emailVerified: idClaims.email_verified === true,
        username: typeof idClaims["cognito:username"] === "string"
          ? idClaims["cognito:username"]
          : undefined,
      },
    } satisfies ValidatedSession;
  } catch {
    return null;
  }
}

export type CookieReader = { get(name: string): { value: string } | undefined };

export async function sessionFromCookies(reader: CookieReader) {
  return validateSessionTokens(
    reader.get(AUTH_COOKIES.access)?.value,
    reader.get(AUTH_COOKIES.id)?.value,
  );
}
