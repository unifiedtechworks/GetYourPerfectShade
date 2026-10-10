import { describe, expect, it } from "vitest";
import { challengeDestination } from "./challenge-routing";

describe("server-controlled Cognito challenge routing", () => {
  it("routes email MFA without producing session tokens", () => {
    const destination = challengeDestination({
      status: "email-mfa-code-required",
      username: "staff@example.com",
      session: "opaque-session",
      challengeName: "EMAIL_OTP",
    }, "/app");

    expect(destination).toEqual({
      path: "/auth/mfa/email",
      challenge: {
        kind: "email-mfa",
        username: "staff@example.com",
        session: "opaque-session",
        next: "/app",
        emailChallengeName: "EMAIL_OTP",
      },
    });
    expect(JSON.stringify(destination)).not.toContain("AccessToken");
  });

  it("routes NEW_PASSWORD_REQUIRED into email MFA when Cognito returns the next challenge", () => {
    expect(challengeDestination({
      status: "new-password-required",
      username: "staff@example.com",
      session: "password-session",
    }, "/app")?.path).toBe("/auth/new-password");
    expect(challengeDestination({
      status: "email-mfa-code-required",
      username: "staff@example.com",
      session: "email-session",
      challengeName: "EMAIL_OTP",
    }, "/app")?.path).toBe("/auth/mfa/email");
  });

  it("preserves only Cognito-approved MFA choices", () => {
    expect(challengeDestination({
      status: "mfa-selection-required",
      username: "staff@example.com",
      session: "selection-session",
      methods: ["email", "software-token"],
    }, "/app")).toMatchObject({
      path: "/auth/mfa/select",
      challenge: { mfaMethods: ["email", "software-token"] },
    });
  });
});
