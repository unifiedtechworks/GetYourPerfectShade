import type { SignInResult } from "./client";
import type { AuthChallenge } from "./cookies";

type PendingChallenge = Omit<AuthChallenge, "version" | "issuedAt">;

export function challengeDestination(
  result: SignInResult,
  next: string,
): { challenge: PendingChallenge; path: string } | null {
  if (result.status === "new-password-required") {
    return {
      challenge: {
        kind: "new-password",
        username: result.username,
        session: result.session,
        next,
      },
      path: "/auth/new-password",
    };
  }
  if (result.status === "mfa-setup-required") {
    return {
      challenge: {
        kind: "mfa-setup",
        username: result.username,
        session: result.session,
        next,
      },
      path: "/auth/mfa/setup",
    };
  }
  if (result.status === "mfa-code-required") {
    return {
      challenge: {
        kind: "software-token-mfa",
        username: result.username,
        session: result.session,
        next,
      },
      path: "/auth/mfa/verify",
    };
  }
  if (result.status === "email-mfa-code-required") {
    return {
      challenge: {
        kind: "email-mfa",
        username: result.username,
        session: result.session,
        next,
        emailChallengeName: result.challengeName,
      },
      path: "/auth/mfa/email",
    };
  }
  if (result.status === "mfa-selection-required") {
    return {
      challenge: {
        kind: "mfa-selection",
        username: result.username,
        session: result.session,
        next,
        mfaMethods: result.methods,
      },
      path: "/auth/mfa/select",
    };
  }
  return null;
}
