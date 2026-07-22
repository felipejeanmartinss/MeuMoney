import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/services/supabase/server";

export async function requireUser() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) redirect("/login");
  return { supabase, user: data.user };
}

export async function getCurrentProfile() {
  const { supabase, user } = await requireUser();
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, full_name, created_at, updated_at")
    .eq("id", user.id)
    .single();

  return { user, profile, profileError: error };
}
