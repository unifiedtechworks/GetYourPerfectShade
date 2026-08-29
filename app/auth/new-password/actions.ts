"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { completeNewPassword } from "@/lib/auth/cognito/client";
import {
  AUTH_COOKIES,
  challengeCookieOptions,
  createChallenge,
  decodeChallenge,
  encodeChallenge,
  setSessionCookies,
} from "@/lib/auth/cognito/cookies";
import { validateStaffPassword } from "@/lib/auth/password-policy";
import { safeNextPath } from "@/lib/auth/redirect";

export async function setInitialPassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const passwordError = validateStaffPassword(
    password,
    String(formData.get("confirmPassword") ?? ""),
  );
  if (passwordError) redirect(`/auth/new-password?error=${passwordError}`);

  const cookieStore = await cookies();
  const challenge = decodeChallenge(cookieStore.get(AUTH_COOKIES.challenge)?.value);
  if (!challenge || challenge.kind !== "new-password") {
    redirect("/sign-in?error=challenge");
  }

  const result = await completeNewPassword(
    challenge.username,
    challenge.session,
    password,
  );
  if (result.status !== "authenticated") {
    if (result.status === "mfa-setup-required" || result.status === "mfa-code-required") {
      const setup = result.status === "mfa-setup-required";
      cookieStore.set(
        AUTH_COOKIES.challenge,
        encodeChallenge(createChallenge({
          kind: setup ? "mfa-setup" : "software-token-mfa",
          username: result.username,
          session: result.session,
          next: challenge.next,
        })),
        challengeCookieOptions(),
      );
      redirect(setup ? "/auth/mfa/setup" : "/auth/mfa/verify");
    }
    const error = result.status === "configuration-error" ? "configuration" : "challenge";
    redirect(`/auth/new-password?error=${error}`);
  }
  setSessionCookies(cookieStore, result.tokens);
  redirect(safeNextPath(challenge.next));
}
