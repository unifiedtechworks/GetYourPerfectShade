"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  AccountApiError,
  createAccountApiClient,
  type MembershipStatusAction,
} from "@/lib/aws/api/account-client";
import { requireOrganizationAccount } from "@/lib/auth/account";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function errorCode(error: unknown): string {
  return error instanceof AccountApiError ? error.code : "account_api_error";
}

export async function updateDisplayName(formData: FormData) {
  const { accessToken } = await requireOrganizationAccount();
  try {
    await createAccountApiClient({ accessToken }).updateProfile({
      displayName: field(formData, "displayName"),
    });
  } catch (error) {
    redirect(`/app/account?error=${encodeURIComponent(errorCode(error))}`);
  }
  revalidatePath("/app/account");
  revalidatePath("/app/account/team");
  redirect("/app/account?updated=profile");
}

export async function inviteTeamMember(formData: FormData) {
  const { accessToken } = await requireOrganizationAccount();
  try {
    await createAccountApiClient({ accessToken }).invite({
      email: field(formData, "email"),
      role: field(formData, "role") as "admin" | "staff",
      resumeExistingUser: formData.get("resumeExistingUser") === "on",
    });
  } catch (error) {
    redirect(`/app/account/team?error=${encodeURIComponent(errorCode(error))}`);
  }
  revalidatePath("/app/account/team");
  redirect("/app/account/team?updated=invited");
}

export async function changeTeamMemberRole(formData: FormData) {
  const { accessToken } = await requireOrganizationAccount();
  try {
    await createAccountApiClient({ accessToken }).changeRole(
      field(formData, "membershipId"),
      { role: field(formData, "role") as "admin" | "staff" },
    );
  } catch (error) {
    redirect(`/app/account/team?error=${encodeURIComponent(errorCode(error))}`);
  }
  revalidatePath("/app/account/team");
  redirect("/app/account/team?updated=role");
}

export async function changeTeamMemberStatus(formData: FormData) {
  const { accessToken } = await requireOrganizationAccount();
  const action = field(formData, "action") as MembershipStatusAction;
  try {
    await createAccountApiClient({ accessToken }).changeStatus(
      field(formData, "membershipId"),
      action,
    );
  } catch (error) {
    redirect(`/app/account/team?error=${encodeURIComponent(errorCode(error))}`);
  }
  revalidatePath("/app/account/team");
  redirect(`/app/account/team?updated=${encodeURIComponent(action)}`);
}
