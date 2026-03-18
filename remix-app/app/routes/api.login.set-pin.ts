import bcrypt from "bcryptjs";
import type { ActionFunctionArgs } from "react-router";
import { clearFailedAttempts, checkRateLimit, recordLoginAttempt } from "~/lib/rate-limit.server";
import { getSupabaseServerClient } from "~/lib/supabase.server";

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

  const body = (await request.json()) as { emp_id?: string; date_of_birth?: string; pin?: string };
  const empId = String(body.emp_id || "").trim().toUpperCase();
  const dob = String(body.date_of_birth || "").trim();
  const rawPin = String(body.pin || "").trim();

  if (!empId || !dob || !rawPin) {
    return json({ error: "INVALID_INPUT" }, { status: 400 });
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

  const salt = await bcrypt.genSalt(10);
  const pinHash = await bcrypt.hash(rawPin, salt);

  const { error: upsertError } = await supabaseServer
    .from("login_users")
    .upsert(
      {
        emp_id: empId,
        pin_hash: pinHash,
        is_registered: true,
        force_pin_change: false,
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
  return json({ success: true }, { status: 200 });
}


