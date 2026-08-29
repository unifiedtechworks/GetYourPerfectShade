"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { safeNextPath } from "@/lib/auth/redirect";
import { authenticateWithPassword } from "@/lib/auth/cognito/client";
import {
  AUTH_COOKIES,
  challengeCookieOptions,
  createChallenge,
  encodeChallenge,
  setSessionCookies,
} from "@/lib/auth/cognito/cookies";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = safeNextPath(String(formData.get("next") ?? ""));
  const result = await authenticateWithPassword(email, password);
  if (result.status === "configuration-error") {
    redirect(`/sign-in?error=configuration&next=${encodeURIComponent(next)}`);
  }
  if (result.status === "new-password-required") {
    const cookieStore = await cookies();
    cookieStore.set(
      AUTH_COOKIES.challenge,
      encodeChallenge(createChallenge({
        kind: "new-password",
        username: result.username,
        session: result.session,
        next,
      })),
      challengeCookieOptions(),
    );
    redirect("/auth/new-password");
  }
  if (result.status === "mfa-setup-required" || result.status === "mfa-code-required") {
    const cookieStore = await cookies();
    const setup = result.status === "mfa-setup-required";
    cookieStore.set(
      AUTH_COOKIES.challenge,
      encodeChallenge(createChallenge({
        kind: setup ? "mfa-setup" : "software-token-mfa",
        username: result.username,
        session: result.session,
        next,
      })),
      challengeCookieOptions(),
    );
    redirect(setup ? "/auth/mfa/setup" : "/auth/mfa/verify");
  }
  if (result.status !== "authenticated") {
    const error = result.status === "unsupported-challenge" ? "challenge" : "credentials";
    redirect(`/sign-in?error=${error}&next=${encodeURIComponent(next)}`);
  }
  setSessionCookies(await cookies(), result.tokens);
  redirect(next);
}
