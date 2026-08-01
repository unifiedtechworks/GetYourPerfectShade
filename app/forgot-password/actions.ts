"use server";

import { redirect } from "next/navigation";
import { startPasswordRecovery } from "@/lib/auth/cognito/client";

export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const configured = await startPasswordRecovery(email);
  redirect(configured
    ? `/reset-password?email=${encodeURIComponent(email)}&sent=1`
    : "/forgot-password?error=configuration");
}
