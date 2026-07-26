import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireAccount() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/sign-in");
  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("role, organizations(id, name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  return { supabase, user, membership };
}
