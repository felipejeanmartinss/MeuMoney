import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv, getServerSecretEnv } from "@/lib/env";
import type { Database } from "@/types/database";

export function createAdminClient() {
  const publicEnv = getPublicEnv();
  const secretEnv = getServerSecretEnv();

  return createClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    secretEnv.SUPABASE_SECRET_KEY,
    {
      auth: {
        autoRefreshToken: false,
        detectSessionInUrl: false,
        persistSession: false,
      },
    },
  );
}
