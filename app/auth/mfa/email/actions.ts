"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { completeEmailMfa } from "@/lib/auth/cognito/client";
import { AUTH_COOKIES, decodeChallenge, setSessionCookies } from "@/lib/auth/cognito/cookies";
import { safeNextPath } from "@/lib/auth/redirect";

export async function verifyEmailMfaCode(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim();
  if (!/^[0-9]{6}$/.test(code)) redirect("/auth/mfa/email?error=code");

  const cookieStore = await cookies();
  const challenge = decodeChallenge(cookieStore.get(AUTH_COOKIES.challenge)?.value);
  if (
    !challenge || challenge.kind !== "email-mfa" ||
    !challenge.emailChallengeName
  ) {
    redirect("/sign-in?error=challenge");
  }

  const result = await completeEmailMfa(
    challenge.username,
    challenge.session,
    code,
    challenge.emailChallengeName,
  );
  if (result.status !== "authenticated") {
    const error = result.status === "configuration-error" ? "configuration" : "code";
    redirect(`/auth/mfa/email?error=${error}`);
  }

  setSessionCookies(cookieStore, result.tokens);
  redirect(safeNextPath(challenge.next));
}
