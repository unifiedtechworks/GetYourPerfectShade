"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revokeSession } from "@/lib/auth/cognito/client";
import { AUTH_COOKIES, clearAuthCookies } from "@/lib/auth/cognito/cookies";

export async function signOut() {
  const cookieStore = await cookies();
  await revokeSession(cookieStore.get(AUTH_COOKIES.access)?.value);
  clearAuthCookies(cookieStore);
  redirect("/sign-in");
}
