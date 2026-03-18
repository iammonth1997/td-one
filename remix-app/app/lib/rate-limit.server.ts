import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;
const LOCKOUT_MINUTES = 15;

export async function checkRateLimit(supabase: SupabaseClient, empId: string) {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("login_attempts")
    .select("attempted_at")
    .eq("emp_id", empId)
    .eq("success", false)
    .gte("attempted_at", windowStart)
    .order("attempted_at", { ascending: false })
    .limit(MAX_ATTEMPTS);

  if (error) {
    console.error("checkRateLimit query failed:", error.message);
    return { locked: false, minutesRemaining: null as number | null };
  }

  if (!data || data.length < MAX_ATTEMPTS) {
    return { locked: false, minutesRemaining: null as number | null };
  }

  const oldestTime = new Date(data[data.length - 1].attempted_at).getTime();
  const lockExpiresAt = oldestTime + LOCKOUT_MINUTES * 60 * 1000;
  const minutesRemaining = Math.ceil((lockExpiresAt - Date.now()) / 60000);

  if (minutesRemaining <= 0) {
    return { locked: false, minutesRemaining: null as number | null };
  }

  return { locked: true, minutesRemaining };
}

export async function recordLoginAttempt(
  supabase: SupabaseClient,
  empId: string,
  success: boolean,
  ipAddress: string | null = null
) {
  await supabase.from("login_attempts").insert({ emp_id: empId, success, ip_address: ipAddress });
}

export async function clearFailedAttempts(supabase: SupabaseClient, empId: string) {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  await supabase
    .from("login_attempts")
    .delete()
    .eq("emp_id", empId)
    .eq("success", false)
    .gte("attempted_at", windowStart);
}
