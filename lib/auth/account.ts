import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import {
  isOrganizationRole,
  type AccountApiResponse,
} from "@/lib/aws/api/account-contracts";
import { getCognitoConfiguration } from "./cognito/config";
import { sessionFromCookies, type AuthenticatedIdentity } from "./cognito/session";

export type OrganizationMembership = AccountApiResponse;

type AccountAvailability = "available" | "api-unconfigured" | "api-unavailable" | "no-membership";

function parseMembership(value: unknown): OrganizationMembership | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<AccountApiResponse>;
  if (
    typeof candidate.organizationId !== "string" || !candidate.organizationId ||
    typeof candidate.organizationName !== "string" || !candidate.organizationName ||
    !isOrganizationRole(candidate.role)
  ) return null;
  return {
    organizationId: candidate.organizationId,
    organizationName: candidate.organizationName,
    role: candidate.role,
  };
}

async function fetchMembership(accessToken: string) {
  const configuration = getCognitoConfiguration();
  if (!configuration?.apiBaseUrl) {
    return { membership: null, availability: "api-unconfigured" as const };
  }
  try {
    const response = await fetch(`${configuration.apiBaseUrl}/v1/account`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });
    if (response.status === 404 || response.status === 403) {
      return { membership: null, availability: "no-membership" as const };
    }
    if (!response.ok) {
      return { membership: null, availability: "api-unavailable" as const };
    }
    const membership = parseMembership(await response.json());
    return {
      membership,
      availability: membership ? "available" as const : "api-unavailable" as const,
    };
  } catch {
    return { membership: null, availability: "api-unavailable" as const };
  }
}

const resolveAccount = cache(async () => {
  const session = await sessionFromCookies(await cookies());
  if (!session) redirect("/sign-in");
  const account = await fetchMembership(session.accessToken);
  return {
    user: session.identity,
    accessToken: session.accessToken,
    membership: account.membership,
    accountAvailability: account.availability satisfies AccountAvailability,
  };
});

export async function requireAccount() {
  return resolveAccount();
}

export async function requireOrganizationAccount() {
  const account = await requireAccount();
  if (!account.membership) redirect("/app");

  return {
    ...account,
    membership: account.membership,
    organizationId: account.membership.organizationId,
  };
}

export function accountDisplayName(identity: AuthenticatedIdentity) {
  return identity.email ?? identity.username ?? identity.sub;
}
