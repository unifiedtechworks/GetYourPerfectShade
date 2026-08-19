import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AUTH_COOKIES,
  clearAuthCookies,
  decodeChallenge,
  encodeChallenge,
  setSessionCookies,
} from "./cookies";

afterEach(() => vi.unstubAllEnvs());

describe("administrator-created user challenge state", () => {
  it("round-trips the short-lived Cognito challenge", () => {
    const challenge = { username: "staff@example.com", session: "opaque-session", next: "/app" };
    expect(decodeChallenge(encodeChallenge(challenge))).toEqual(challenge);
  });

  it("rejects malformed challenge state", () => {
    expect(decodeChallenge("not-json")).toBeNull();
  });
});

describe("authentication cookie hardening", () => {
  it("sets production session cookies as secure, HttpOnly, and SameSite Lax", () => {
    vi.stubEnv("NODE_ENV", "production");
    const writes: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];
    setSessionCookies({
      set(name, value, options) {
        writes.push({ name, value, options });
      },
    }, {
      AccessToken: "access-token",
      IdToken: "id-token",
      RefreshToken: "refresh-token",
      ExpiresIn: 3600,
    });

    expect(writes.map(({ name }) => name)).toEqual([
      AUTH_COOKIES.access,
      AUTH_COOKIES.id,
      AUTH_COOKIES.refresh,
      AUTH_COOKIES.challenge,
    ]);
    for (const { options } of writes) {
      expect(options).toMatchObject({
        httpOnly: true,
        sameSite: "lax",
        secure: true,
        path: "/",
      });
    }
  });

  it("expires every authentication cookie during local sign-out", () => {
    const writes: Array<{ name: string; value: string; maxAge?: number }> = [];
    clearAuthCookies({
      set(name, value, options) {
        writes.push({ name, value, maxAge: options.maxAge });
      },
    });

    expect(writes).toHaveLength(Object.keys(AUTH_COOKIES).length);
    expect(writes.every(({ value, maxAge }) => value === "" && maxAge === 0)).toBe(true);
  });
});
