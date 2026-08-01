import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type EstimateApiIdentity = Readonly<{ accessToken: string }>;

/**
 * Temporary cross-thread adapter.
 *
 * Estimate code consumes only a bearer token and never a Supabase organization ID.
 * Chat 2 can replace this function's internals with its Cognito/OIDC session resolver
 * without changing estimate routes or API contracts.
 */
export async function requireEstimateApiIdentity(): Promise<EstimateApiIdentity> {
  const supabase = await createClient();
  const [{ data: userResult }, { data: sessionResult }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.auth.getSession(),
  ]);
  const accessToken = sessionResult.session?.access_token;
  if (!userResult.user || !accessToken) redirect("/sign-in");
  return { accessToken };
}
