import { requireOrganizationAccount } from "@/lib/auth/account";

export type EstimateApiIdentity = Readonly<{ accessToken: string }>;

export async function requireEstimateApiIdentity(): Promise<EstimateApiIdentity> {
  const account = await requireOrganizationAccount();
  return { accessToken: account.accessToken };
}
