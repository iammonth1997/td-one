/**
 * Employee Onboarding — Activate Account
 *
 * POST /api/login/activate
 * Body: { emp_id: string, activation_code: string, password: string, device_id?: string, device_name?: string }
 * Returns: session cookie (same format as regular login)
 *
 * Flow:
 *  1. Employee enters emp_id + 8-digit activation code
 *  2. System validates code (not used, not expired, not invalidated, < 5 failures)
 *  3. Employee sets initial NIST-compliant password (min 12 chars)
 *  4. First device auto-registered
 *  5. 30-day session created
 */

import type { ActionFunctionArgs } from "react-router";
import { getSupabaseServerClient } from "~/lib/supabase.server";
import { validatePasswordPolicy, hashPassword } from "~/lib/password.server";
import { sessionTokenCookie } from "~/lib/session-cookie.server";
import { EMPLOYEE_PORTAL } from "~/lib/session-context";
import { writeAuditLog, AuditEvent } from "~/lib/audit-log.server";
import bcrypt from "bcryptjs";
import { getDeviceIdFromRequest } from "~/lib/device-cookie.server";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_CODE_FAILURES = 5;

function createSessionToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (v) => v.toString(16).padStart(2, "0")).join("");
}

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers || {}),
    },
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { isServiceRoleEnabled, supabaseServer } = getSupabaseServerClient(context);
  if (!isServiceRoleEnabled) {
    return json({ error: "SERVER_CONFIG_MISSING" }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as {
    emp_id?: string;
    activation_code?: string;
    password?: string;
    device_id?: string;
    device_name?: string;
    platform?: string;
    app_version?: string;
  } | null;

  const empId = String(body?.emp_id || "").trim().toUpperCase();
  const activationCode = String(body?.activation_code || "").trim();
  const rawPassword = String(body?.password || "").trim();
  let deviceId = String(body?.device_id || "").trim() || null;
  const deviceName = String(body?.device_name || "").trim() || null;
  const platform = (["android", "ios", "web"].includes(body?.platform ?? "")) ? body!.platform! : "web";

  if (!empId || !activationCode || !rawPassword) {
    return json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const ipAddress = request.headers.get("x-forwarded-for") || null;
  if (!deviceId) {
    deviceId = (await getDeviceIdFromRequest(request)) || null;
  }

  // ─── Password policy check ────────────────────────────────────────────────
  const policyResult = validatePasswordPolicy(rawPassword, empId);
  if (!policyResult.valid) {
    return json({ error: policyResult.error || "INVALID_PASSWORD_FORMAT" }, { status: 400 });
  }

  // ─── Look up activation record ────────────────────────────────────────────
  const { data: activation, error: actErr } = await supabaseServer
    .from("employee_activations")
    .select("id, activation_code_hash, expires_at, failed_attempts, is_used, is_invalidated")
    .eq("emp_id", empId)
    .eq("is_used", false)
    .eq("is_invalidated", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (actErr) {
    console.error("activate: DB query error:", actErr.message);
    return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  if (!activation) {
    // No active code — return same error as wrong code (prevent user enumeration)
    return json({ error: "INVALID_ACTIVATION_CODE" }, { status: 400 });
  }

  if (new Date(activation.expires_at) < new Date()) {
    void supabaseServer
      .from("employee_activations")
      .update({ is_invalidated: true })
      .eq("id", activation.id);
    return json({ error: "ACTIVATION_CODE_EXPIRED" }, { status: 400 });
  }

  if ((activation.failed_attempts ?? 0) >= MAX_CODE_FAILURES) {
    void supabaseServer
      .from("employee_activations")
      .update({ is_invalidated: true })
      .eq("id", activation.id);
    void writeAuditLog(supabaseServer, {
      event_type: AuditEvent.ACTIVATION_CODE_INVALIDATED,
      severity: "warning",
      emp_id: empId,
      ip_address: ipAddress,
      metadata: { reason: "too_many_failures" },
    });
    return json({ error: "ACTIVATION_CODE_LOCKED" }, { status: 400 });
  }

  // ─── Verify code ──────────────────────────────────────────────────────────
  const codeValid = await bcrypt.compare(activationCode, activation.activation_code_hash);

  if (!codeValid) {
    void supabaseServer
      .from("employee_activations")
      .update({ failed_attempts: (activation.failed_attempts ?? 0) + 1 })
      .eq("id", activation.id);
    void writeAuditLog(supabaseServer, {
      event_type: AuditEvent.ACTIVATION_CODE_FAILED,
      severity: "warning",
      emp_id: empId,
      ip_address: ipAddress,
    });
    return json({ error: "INVALID_ACTIVATION_CODE" }, { status: 400 });
  }

  // ─── Look up employee ────────────────────────────────────────────────────
  const { data: emp } = await supabaseServer
    .from("employees")
    .select("id, status")
    .eq("employee_code", empId)
    .maybeSingle();

  if (!emp || emp.status !== "active") {
    return json({ error: emp ? "ACCOUNT_BLOCKED" : "EMPLOYEE_NOT_FOUND" }, { status: 403 });
  }

  // ─── Set password ─────────────────────────────────────────────────────────
  const passwordHash = await hashPassword(rawPassword);

  const { error: upsertErr } = await supabaseServer
    .from("login_users")
    .upsert(
      {
        emp_id: empId,
        pin_hash: passwordHash,
        password_changed_at: new Date().toISOString(),
        password_history: [],
        is_registered: true,
        force_pin_change: false,
        must_change_password: false,
      },
      { onConflict: "emp_id" }
    );

  if (upsertErr) {
    console.error("activate: upsert error:", upsertErr.message);
    return json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  // ─── Mark activation code as used ────────────────────────────────────────
  void supabaseServer
    .from("employee_activations")
    .update({ is_used: true, used_at: new Date().toISOString() })
    .eq("id", activation.id);

  // ─── Register device ──────────────────────────────────────────────────────
  if (deviceId) {
    void supabaseServer.from("employee_devices").insert({
      employee_id: emp.id,
      device_id: deviceId,
      device_name: deviceName,
      platform,
      registered_at: new Date().toISOString(),
      last_active_at: new Date().toISOString(),
      is_active: true,
    });
  }

  // ─── Create session ───────────────────────────────────────────────────────
  const sessionToken = createSessionToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  // Get default role
  const { data: loginUser } = await supabaseServer
    .from("login_users")
    .select("role")
    .eq("emp_id", empId)
    .maybeSingle();

  const { error: sessionErr } = await supabaseServer.from("sessions").insert({
    session_token: sessionToken,
    emp_id: empId,
    role: loginUser?.role ?? "employee",
    expires_at: expiresAt,
    is_active: true,
    login_context: EMPLOYEE_PORTAL,
    ip_address: ipAddress,
    device_id: deviceId,
    user_agent: request.headers.get("user-agent") || null,
  });

  if (sessionErr) {
    console.error("activate: session insert error:", sessionErr.message);
    return json({ error: "SESSION_CREATE_FAILED" }, { status: 500 });
  }

  void writeAuditLog(supabaseServer, {
    event_type: AuditEvent.ACTIVATION_CODE_USED,
    emp_id: empId,
    device_id: deviceId,
    ip_address: ipAddress,
    metadata: { device_name: deviceName, platform },
  });

  return json(
    {
      success: true,
      role: loginUser?.role ?? "employee",
      login_context: EMPLOYEE_PORTAL,
    },
    {
      status: 200,
      headers: {
        "Set-Cookie": await sessionTokenCookie.serialize(sessionToken, {
          secure: new URL(request.url).protocol === "https:",
        }),
      },
    }
  );
}
