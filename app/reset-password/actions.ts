"use server";

import { redirect } from "next/navigation";
import { confirmPasswordRecovery } from "@/lib/auth/cognito/client";

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  if (password.length < 12) {
    redirect(`/reset-password?error=length&email=${encodeURIComponent(email)}`);
  }
  const result = await confirmPasswordRecovery(email, code, password);
  if (result.status !== "complete") {
    const error = result.status === "configuration-error" ? "configuration" : "recovery";
    redirect(`/reset-password?error=${error}&email=${encodeURIComponent(email)}`);
  }
  redirect("/sign-in?reset=complete");
}
