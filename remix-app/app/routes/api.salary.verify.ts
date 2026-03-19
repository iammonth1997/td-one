/**
 * Salary Re-Authentication
 *
 * POST /api/salary/verify
 * Body: { password: string }
 * Returns: { salary_access_token: string, expires_in: 300 }
 *
 * Re-auth required every 5 minutes before viewing salary data.
 * Salary access rate limit: max 3 failures → 15-min lockout (separate from login lockout).
 * All accesses are audit-logged.
 */

import type { ActionFunctionArgs } from "react-router";
import { validateSession } from "~/lib/session-validation.server";
import { getSupabaseServerClient } from "~/lib/supabase.server";
import { verifyPassword } from "~/lib/password.server";
import { writeAuditLog, AuditEvent, isOutsideBusinessHours } from "~/lib/audit-log.server";

const SALARY_SESSION_DURATION_MS = 5 * 60 * 1000;   // 5 minutes
const SALARY_MAX_FAILURES = 3;
const SALARY_LOCKOUT_MINUTES = 15;

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      // Prevent salary tokens from being cached
      "Cache-Control": "no-store, no-cache, must-revalidate",
      ...(init?.headers || {}),
    },
  });
}

function createSalaryToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (v) => v.toString(16).padStart(2, "0")).join("");
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { session, error: authError, status: authStatus } = await validateSession(request, context);
  if (authError || !session) {
    return json({ error: authError || "UNAUTHORIZED" }, { status: authStatus || 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    password?: string;
    pin?: string;
  } | null;
  const password = String(body?.password || body?.pin || "").trim();

  if (!password) {
    return json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const ipAddress = request.headers.get("x-forwarded-for") || null;
  const { supabaseServer } = getSupabaseServerClient(context);

  // ─── Check salary-specific rate limit ─────────────────────────────────────
  // Reuse login_attempts table with a different key pattern (salary:<emp_id>)
  const salaryKey = `salary:${session.emp_id}`;
  const windowStart = new Date(Date.now() - SALARY_LOCKOUT_MINUTES * 60 * 1000).toISOString();

  const { count: recentFailures } = await supabaseServer
    .from("login_attempts")
    .select("id", { count: "exact", head: true })
    .eq("emp_id", salaryKey)
    .eq("success", false)
    .gte("attempted_at", windowStart);

  if ((recentFailures ?? 0) >= SALARY_MAX_FAILURES) {
    void writeAuditLog(supabaseServer, {
      event_type: AuditEvent.SALARY_ACCESS_LOCKED,
      severity: "warning",
      emp_id: session.emp_id,
      ip_address: ipAddress,
      metadata: { recent_failures: recentFailures },
    });
    return json(
      { error: "SALARY_ACCESS_LOCKED", message: "Too many failed attempts. Try again in 15 minutes." },
      { status: 429 }
    );
  }

  // ─── Verify password ───────────────────────────────────────────────────────
  const { data: user } = await supabaseServer
    .from("login_users")
    .select("pin_hash")
    .eq("emp_id", session.emp_id)
    .maybeSingle();

  const valid = user?.pin_hash ? await verifyPassword(password, user.pin_hash) : false;

  if (!valid) {
    // Record salary-specific failure
    void supabaseServer.from("login_attempts").insert({
      emp_id: salaryKey,
      attempted_at: new Date().toISOString(),
      success: false,
      ip_address: ipAddress,
    });

    void writeAuditLog(supabaseServer, {
      event_type: AuditEvent.SALARY_AUTH_FAILED,
      severity: "warning",
      emp_id: session.emp_id,
      ip_address: ipAddress,
    });

    // Audit log to salary_access_logs
    void supabaseServer.from("salary_access_logs").insert({
      emp_id: session.emp_id,
      ip_address: ipAddress,
      access_granted: false,
      failure_reason: "INVALID_CREDENTIALS",
    });

    return json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  // ─── Issue salary session token ────────────────────────────────────────────
  const rawToken = createSalaryToken(32);
  const tokenHash = await hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SALARY_SESSION_DURATION_MS).toISOString();

  const { error: insertErr } = await supabaseServer.from("salary_sessions").insert({
    token_hash: tokenHash,
    emp_id: session.emp_id,
    expires_at: expiresAt,
  });

  if (insertErr) {
    console.error("salary_sessions insert error:", insertErr.message);
    return json({ error: "SESSION_CREATE_FAILED" }, { status: 500 });
  }

  // Record success in salary access log
  void supabaseServer.from("salary_access_logs").insert({
    emp_id: session.emp_id,
    ip_address: ipAddress,
    access_granted: true,
  });

  void writeAuditLog(supabaseServer, {
    event_type: AuditEvent.SALARY_AUTH_SUCCESS,
    emp_id: session.emp_id,
    ip_address: ipAddress,
    ...(isOutsideBusinessHours() && {
      is_alert: true,
      severity: "warning" as const,
      metadata: { note: "salary auth outside business hours" },
    }),
  });

  return json({
    salary_access_token: rawToken,
    expires_in: 300,
  });
}

/** SHA-256 hash of the raw token (stored in DB, never the plain token) */
async function hashToken(token: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}
