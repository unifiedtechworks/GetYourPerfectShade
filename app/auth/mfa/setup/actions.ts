"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { beginMfaSetup, completeMfaSetup } from "@/lib/auth/cognito/client";
import {
  AUTH_COOKIES,
  challengeCookieOptions,
  createChallenge,
  decodeChallenge,
  encodeChallenge,
  setSessionCookies,
} from "@/lib/auth/cognito/cookies";
import { safeNextPath } from "@/lib/auth/redirect";

export type MfaSetupStartState =
  | { status: "idle" }
  | { status: "ready"; secret: string }
  | { status: "error"; error: "challenge" | "configuration" | "setup" };

export type MfaSetupVerifyState =
  | { status: "idle" }
  | { status: "error"; error: "code" | "challenge" | "configuration" };

export async function startMfaSetup(
  _previous: MfaSetupStartState,
  _formData: FormData,
): Promise<MfaSetupStartState> {
  const cookieStore = await cookies();
  const challenge = decodeChallenge(cookieStore.get(AUTH_COOKIES.challenge)?.value);
  if (!challenge || challenge.kind !== "mfa-setup") {
    return { status: "error", error: "challenge" };
  }

  const result = await beginMfaSetup(challenge.session);
  if (result.status === "configuration-error") {
    return { status: "error", error: "configuration" };
  }
  if (result.status !== "setup-ready") {
    return { status: "error", error: "setup" };
  }

  cookieStore.set(
    AUTH_COOKIES.challenge,
    encodeChallenge(createChallenge({
      kind: "mfa-setup-verification",
      username: challenge.username,
      session: result.session,
      next: challenge.next,
    })),
    challengeCookieOptions(),
  );
  return { status: "ready", secret: result.secret };
}

export async function verifyMfaSetup(
  _previous: MfaSetupVerifyState,
  formData: FormData,
): Promise<MfaSetupVerifyState> {
  const code = String(formData.get("code") ?? "").trim();
  if (!/^[0-9]{6}$/.test(code)) return { status: "error", error: "code" };

  const cookieStore = await cookies();
  const challenge = decodeChallenge(cookieStore.get(AUTH_COOKIES.challenge)?.value);
  if (!challenge || challenge.kind !== "mfa-setup-verification") {
    return { status: "error", error: "challenge" };
  }

  const result = await completeMfaSetup(challenge.username, challenge.session, code);
  if (result.status === "configuration-error") {
    return { status: "error", error: "configuration" };
  }
  if (result.status !== "authenticated") {
    if (result.status === "mfa-code-error") return { status: "error", error: "code" };
    redirect("/sign-in?error=challenge");
  }

  setSessionCookies(cookieStore, result.tokens);
  redirect(safeNextPath(challenge.next));
}
