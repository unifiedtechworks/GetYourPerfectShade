import { afterEach, describe, expect, it, vi } from "vitest";
import { generateKeyPair, SignJWT } from "jose";
import { getCognitoConfiguration } from "./config";
import { verifyAccessToken, verifyIdToken } from "./session";

describe("Cognito token validation", () => {
  afterEach(() => vi.unstubAllEnvs());

  async function fixture(tokenUse: "access" | "id", overrides: Record<string, unknown> = {}) {
    vi.stubEnv("NEXT_PUBLIC_AWS_REGION", "us-west-2");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_ID", "us-west-2_example");
    vi.stubEnv("NEXT_PUBLIC_COGNITO_USER_POOL_CLIENT_ID", "client-123");
    const configuration = getCognitoConfiguration()!;
    const { privateKey, publicKey } = await generateKeyPair("RS256");
    let builder = new SignJWT({
      token_use: tokenUse,
      sub: "staff-subject",
      ...(tokenUse === "access" ? { client_id: "client-123" } : {}),
      ...overrides,
    })
      .setProtectedHeader({ alg: "RS256", kid: "fixture" })
      .setIssuer(configuration.issuer)
      .setIssuedAt()
      .setExpirationTime("5m");
    if (tokenUse === "id") builder = builder.setAudience("client-123");
    return { token: await builder.sign(privateKey), publicKey, configuration };
  }

  it("accepts a valid signed access token", async () => {
    const { token, publicKey, configuration } = await fixture("access");
    await expect(verifyAccessToken(token, configuration, publicKey)).resolves.toMatchObject({
      sub: "staff-subject",
      token_use: "access",
    });
  });

  it("rejects an access token issued for another app client", async () => {
    const { token, publicKey, configuration } = await fixture("access", { client_id: "other" });
    await expect(verifyAccessToken(token, configuration, publicKey)).rejects.toThrow();
  });

  it("rejects an ID token used as an access token", async () => {
    const { token, publicKey, configuration } = await fixture("id");
    await expect(verifyAccessToken(token, configuration, publicKey)).rejects.toThrow();
  });

  it("accepts a valid signed ID token", async () => {
    const { token, publicKey, configuration } = await fixture("id", {
      email: "staff@example.com",
      email_verified: true,
    });
    await expect(verifyIdToken(token, configuration, publicKey)).resolves.toMatchObject({
      email: "staff@example.com",
      email_verified: true,
    });
  });
});
