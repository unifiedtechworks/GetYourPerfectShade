"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { completeNewPassword } from "@/lib/auth/cognito/client";
import {
  AUTH_COOKIES,
  decodeChallenge,
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
  if (!challenge) redirect("/sign-in?error=challenge");

  const result = await completeNewPassword(
    challenge.username,
    challenge.session,
    password,
  );
  if (result.status !== "authenticated") {
    const error = result.status === "configuration-error" ? "configuration" : "challenge";
    redirect(`/auth/new-password?error=${error}`);
  }
  setSessionCookies(cookieStore, result.tokens);
  redirect(safeNextPath(challenge.next));
}
