import { describe, expect, it } from "vitest";
import { decodeChallenge, encodeChallenge } from "./cookies";

describe("administrator-created user challenge state", () => {
  it("round-trips the short-lived Cognito challenge", () => {
    const challenge = { username: "staff@example.com", session: "opaque-session", next: "/app" };
    expect(decodeChallenge(encodeChallenge(challenge))).toEqual(challenge);
  });

  it("rejects malformed challenge state", () => {
    expect(decodeChallenge("not-json")).toBeNull();
  });
});
