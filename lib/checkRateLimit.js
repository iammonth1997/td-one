import { supabaseServer } from "@/lib/supabaseServer";

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;
const LOCKOUT_MINUTES = 15;

/**
 * Check if an emp_id is rate-limited.
 * @param {string} empId
 * @returns {Promise<{ locked: boolean, minutesRemaining: number|null }>}
 */
export async function checkRateLimit(empId) {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  const { data, error } = await supabaseServer
    .from("login_attempts")
    .select("attempted_at")
    .eq("emp_id", empId)
    .eq("success", false)
    .gte("attempted_at", windowStart)
    .order("attempted_at", { ascending: false })
    .limit(MAX_ATTEMPTS);

  if (error) {
    console.error("checkRateLimit query failed:", error.message);
    return { locked: false, minutesRemaining: null };
  }

  if (!data || data.length < MAX_ATTEMPTS) {
    return { locked: false, minutesRemaining: null };
  }

  const oldestTime = new Date(data[data.length - 1].attempted_at).getTime();
  const lockExpiresAt = oldestTime + LOCKOUT_MINUTES * 60 * 1000;
  const minutesRemaining = Math.ceil((lockExpiresAt - Date.now()) / 60000);

  if (minutesRemaining <= 0) {
    return { locked: false, minutesRemaining: null };
  }

  return { locked: true, minutesRemaining };
}

/**
 * Record a login attempt.
 */
export async function recordLoginAttempt(empId, success, ipAddress = null) {
  await supabaseServer
    .from("login_attempts")
    .insert({ emp_id: empId, success, ip_address: ipAddress });
}

/**
 * Clear recent failed attempts for an emp_id (on successful login).
 */
export async function clearFailedAttempts(empId) {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000).toISOString();

  await supabaseServer
    .from("login_attempts")
    .delete()
    .eq("emp_id", empId)
    .eq("success", false)
    .gte("attempted_at", windowStart);
}
