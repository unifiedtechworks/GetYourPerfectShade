"use server";

import { redirect } from "next/navigation";
import { startPasswordRecovery } from "@/lib/auth/cognito/client";
import { getPasswordRecoveryPolicy } from "@/lib/auth/cognito/config";

export async function requestPasswordReset(formData: FormData) {
  const policy = getPasswordRecoveryPolicy();
  if (policy === "administrator-only") {
    redirect("/forgot-password?recovery=administrator");
  }
  if (policy === "configuration-error") {
    redirect("/forgot-password?error=configuration");
  }
  const email = String(formData.get("email") ?? "").trim();
  const configured = await startPasswordRecovery(email);
  redirect(configured
    ? `/reset-password?email=${encodeURIComponent(email)}&sent=1`
    : "/forgot-password?error=configuration");
}
