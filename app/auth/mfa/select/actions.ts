"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { selectMfaType, type MfaMethod } from "@/lib/auth/cognito/client";
import { challengeDestination } from "@/lib/auth/cognito/challenge-routing";
import {
  AUTH_COOKIES,
  challengeCookieOptions,
  createChallenge,
  decodeChallenge,
  encodeChallenge,
  setSessionCookies,
} from "@/lib/auth/cognito/cookies";
import { safeNextPath } from "@/lib/auth/redirect";

export async function chooseMfaMethod(formData: FormData) {
  const method = String(formData.get("method") ?? "") as MfaMethod;
  const cookieStore = await cookies();
  const challenge = decodeChallenge(cookieStore.get(AUTH_COOKIES.challenge)?.value);
  if (
    !challenge || challenge.kind !== "mfa-selection" ||
    !challenge.mfaMethods?.some((selection) => selection.method === method)
  ) {
    redirect("/sign-in?error=challenge");
  }

  const selection = challenge.mfaMethods.find((item) => item.method === method);
  if (!selection) redirect("/sign-in?error=challenge");

  const result = await selectMfaType(challenge.username, challenge.session, selection.answer);
  if (result.status === "authenticated") {
    setSessionCookies(cookieStore, result.tokens);
    redirect(safeNextPath(challenge.next));
  }

  const destination = challengeDestination(result, challenge.next);
  if (destination) {
    cookieStore.set(
      AUTH_COOKIES.challenge,
      encodeChallenge(createChallenge(destination.challenge)),
      challengeCookieOptions(),
    );
    redirect(destination.path);
  }

  const error = result.status === "configuration-error" ? "configuration" : "challenge";
  redirect(`/auth/mfa/select?error=${error}`);
}
