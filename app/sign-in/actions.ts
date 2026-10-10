"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { safeNextPath } from "@/lib/auth/redirect";
import { authenticateWithPassword } from "@/lib/auth/cognito/client";
import { challengeDestination } from "@/lib/auth/cognito/challenge-routing";
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
  const destination = challengeDestination(result, next);
  if (destination) {
    const cookieStore = await cookies();
    cookieStore.set(
      AUTH_COOKIES.challenge,
      encodeChallenge(createChallenge(destination.challenge)),
      challengeCookieOptions(),
    );
    redirect(destination.path);
  }
  if (result.status !== "authenticated") {
    const error = result.status === "unsupported-challenge" ? "challenge" : "credentials";
    redirect(`/sign-in?error=${error}&next=${encodeURIComponent(next)}`);
  }
  setSessionCookies(await cookies(), result.tokens);
  redirect(next);
}
