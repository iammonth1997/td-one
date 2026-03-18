import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "~/lib/env.server";

export function getSupabaseServerClient(context: unknown) {
  const env = getServerEnv(context);
  const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseKey = supabaseServiceRoleKey || supabaseAnonKey;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error("Missing Supabase environment variables for server client");
  }

  return {
    isServiceRoleEnabled: Boolean(supabaseServiceRoleKey),
    supabaseServer: createClient(supabaseUrl, supabaseKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }),
  };
}
