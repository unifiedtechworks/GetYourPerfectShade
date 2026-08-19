"use server";

import { redirect } from "next/navigation";
import { confirmPasswordRecovery } from "@/lib/auth/cognito/client";
import { validateStaffPassword } from "@/lib/auth/password-policy";

export async function updatePassword(formData: FormData) {
  const password = String(formData.get("password") ?? "");
  const email = String(formData.get("email") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  const passwordError = validateStaffPassword(
    password,
    String(formData.get("confirmPassword") ?? ""),
  );
  if (passwordError) {
    redirect(`/reset-password?error=${passwordError}&email=${encodeURIComponent(email)}`);
  }
  const result = await confirmPasswordRecovery(email, code, password);
  if (result.status !== "complete") {
    const error = result.status === "configuration-error" ? "configuration" : "recovery";
    redirect(`/reset-password?error=${error}&email=${encodeURIComponent(email)}`);
  }
  redirect("/sign-in?reset=complete");
}
