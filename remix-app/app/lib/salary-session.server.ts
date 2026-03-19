/**
 * Validates a salary_access_token from the Authorization header.
 * Returns the emp_id if valid, or an error.
 *
 * Salary sessions expire after 5 minutes.
 * Cache-Control: no-store is enforced at the response layer.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

async function hashToken(token: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function validateSalarySession(
  request: Request,
  supabase: SupabaseClient
): Promise<{ emp_id: string | null; error: string | null }> {
  const authHeader = request.headers.get("x-salary-token") || request.headers.get("authorization");
  let rawToken: string | null = null;

  if (authHeader?.startsWith("SalaryToken ")) {
    rawToken = authHeader.slice(12).trim();
  } else if (authHeader?.startsWith("Bearer ")) {
    // Fallback: allow Bearer but only for salary-specific dedicated header
    rawToken = null; // don't accept Bearer here to avoid confusion with session tokens
  }

  if (!rawToken) {
    return { emp_id: null, error: "MISSING_SALARY_TOKEN" };
  }

  const tokenHash = await hashToken(rawToken);

  const { data, error: dbErr } = await supabase
    .from("salary_sessions")
    .select("emp_id, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (dbErr) {
    console.error("validateSalarySession DB error:", dbErr.message);
    return { emp_id: null, error: "SESSION_VALIDATION_FAILED" };
  }

  if (!data) {
    return { emp_id: null, error: "INVALID_SALARY_TOKEN" };
  }

  if (new Date(data.expires_at) < new Date()) {
    // Cleanup expired token
    void supabase.from("salary_sessions").delete().eq("token_hash", tokenHash);
    return { emp_id: null, error: "SALARY_TOKEN_EXPIRED" };
  }

  return { emp_id: data.emp_id, error: null };
}
