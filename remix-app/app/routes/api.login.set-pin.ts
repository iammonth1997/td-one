import type { ActionFunctionArgs } from "react-router";
import { clearFailedAttempts, checkRateLimit, recordLoginAttempt } from "~/lib/rate-limit.server";
import { getSupabaseServerClient } from "~/lib/supabase.server";
import { validatePasswordPolicy, hashPassword } from "~/lib/password.server";
import { writeAuditLog, AuditEvent } from "~/lib/audit-log.server";

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
    return json(
      { error: "SERVER_CONFIG_MISSING", message: "SUPABASE_SERVICE_ROLE_KEY is required" },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => null)) as {
    emp_id?: string;
    date_of_birth?: string;
    pin?: string;
    password?: string;
  } | null;
  const empId = String(body?.emp_id || "").trim().toUpperCase();
  const dob = String(body?.date_of_birth || "").trim();
  // Accept "password" (new) or "pin" (old) field
  const rawPassword = String(body?.password || body?.pin || "").trim();

  if (!empId || !dob || !rawPassword) {
    return json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  // Enforce NIST password policy
  const policyResult = validatePasswordPolicy(rawPassword, empId);
  if (!policyResult.valid) {
    return json({ error: policyResult.error || "INVALID_PASSWORD_FORMAT" }, { status: 400 });
  }

  const { locked, minutesRemaining } = await checkRateLimit(supabaseServer, empId);
  if (locked) {
    return json({ error: "ACCOUNT_LOCKED", minutesRemaining }, { status: 429 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  const { data: emp, error: empQueryError } = await supabaseServer
    .from("employees")
    .select("date_of_birth, status")
    .eq("employee_code", empId)
    .maybeSingle();

  if (empQueryError) {
    console.error("set-pin employees query failed:", empQueryError.message);
    return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  if (!emp) {
    return json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });
  }

  if (emp.status !== "active") {
    return json({ error: "ACCOUNT_BLOCKED", reason: emp.status }, { status: 403 });
  }

  const employeeDob = String(emp.date_of_birth || "").slice(0, 10);
  if (employeeDob !== dob) {
    await recordLoginAttempt(supabaseServer, empId, false, ip);
    return json({ error: "INVALID_DOB" }, { status: 400 });
  }

  const pinHash = await hashPassword(rawPassword);

  const { error: upsertError } = await supabaseServer
    .from("login_users")
    .upsert(
      {
        emp_id: empId,
        pin_hash: pinHash,
        password_changed_at: new Date().toISOString(),
        password_history: [],
        is_registered: true,
        force_pin_change: false,
        must_change_password: false,
        temp_pin_expires_at: null,
        temp_pin_issued_at: null,
        temp_pin_issued_by: null,
      },
      { onConflict: "emp_id" }
    )
    .select("emp_id");

  if (upsertError) {
    console.error("set-pin login_users upsert failed:", upsertError.message);
    return json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  await clearFailedAttempts(supabaseServer, empId);

  void writeAuditLog(supabaseServer, {
    event_type: AuditEvent.PASSWORD_CHANGED,
    emp_id: empId,
    ip_address: ip,
    metadata: { action: "initial_password_set" },
  });

  return json({ success: true }, { status: 200 });
}


