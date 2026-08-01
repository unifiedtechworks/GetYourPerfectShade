import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCognitoConfiguration } from "./cognito/config";
import { sessionFromCookies, type AuthenticatedIdentity } from "./cognito/session";

export type OrganizationRole = "owner" | "admin" | "staff";

export type OrganizationMembership = {
  organizationId: string;
  organizationName: string;
  role: OrganizationRole;
};

export type AccountApiResponse = OrganizationMembership;

type AccountAvailability = "available" | "api-unconfigured" | "api-unavailable" | "no-membership";

function validRole(value: unknown): value is OrganizationRole {
  return value === "owner" || value === "admin" || value === "staff";
}

function parseMembership(value: unknown): OrganizationMembership | null {
  if (typeof value !== "object" || value === null) return null;
  const candidate = value as Partial<AccountApiResponse>;
  if (
    typeof candidate.organizationId !== "string" || !candidate.organizationId ||
    typeof candidate.organizationName !== "string" || !candidate.organizationName ||
    !validRole(candidate.role)
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

export async function requireAccount() {
  const session = await sessionFromCookies(await cookies());
  if (!session) redirect("/sign-in");
  const account = await fetchMembership(session.accessToken);
  return {
    user: session.identity,
    accessToken: session.accessToken,
    membership: account.membership,
    accountAvailability: account.availability satisfies AccountAvailability,
  };
}

export async function requireOrganizationAccount() {
  const account = await requireAccount();
  if (!account.membership) redirect("/app");

  // Temporary estimate-only bridge. Chat 3 owns replacing Supabase estimate persistence with
  // the AWS API. Cognito is already the active account provider; this client has no auth role.
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  return {
    ...account,
    membership: account.membership,
    organizationId: account.membership.organizationId,
    supabase,
  };
}

export function accountDisplayName(identity: AuthenticatedIdentity) {
  return identity.email ?? identity.username ?? identity.sub;
}
