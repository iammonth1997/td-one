import bcrypt from "bcryptjs";
import type { ActionFunctionArgs } from "react-router";
import { clearFailedAttempts, checkRateLimit, recordLoginAttempt } from "~/lib/rate-limit.server";
import { sessionTokenCookie } from "~/lib/session-cookie.server";
import { EMPLOYEE_PORTAL } from "~/lib/session-context";
import { getSupabaseServerClient } from "~/lib/supabase.server";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function createSessionToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
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
  const perfStart = performance.now();
  const checkpoints: Record<string, number> = {};
  const stamp = (label: string) => {
    checkpoints[label] = Number((performance.now() - perfStart).toFixed(1));
  };

  let empIdForLog: string | null = null;
  const logTiming = (outcome: string) => {
    console.info("[login][timing]", {
      emp_id: empIdForLog || "UNKNOWN",
      outcome,
      total_ms: Number((performance.now() - perfStart).toFixed(1)),
      checkpoints,
    });
  };

  const { isServiceRoleEnabled, supabaseServer } = getSupabaseServerClient(context);

  if (!isServiceRoleEnabled) {
    stamp("service_role_check");
    logTiming("SERVER_CONFIG_MISSING");
    return json(
      { error: "SERVER_CONFIG_MISSING", message: "SUPABASE_SERVICE_ROLE_KEY is required" },
      { status: 500 }
    );
  }

  const body = (await request.json()) as { emp_id?: string; pin?: string };
  const empId = String(body.emp_id || "").trim().toUpperCase();
  const rawPin = String(body.pin || "").trim();
  empIdForLog = empId;
  stamp("input_parsed");

  if (!empId || !rawPin) {
    logTiming("INVALID_INPUT");
    return json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;

  const { locked, minutesRemaining } = await checkRateLimit(supabaseServer, empId);
  stamp("rate_limit_checked");

  if (locked) {
    logTiming("ACCOUNT_LOCKED");
    return json({ error: "ACCOUNT_LOCKED", minutes_remaining: minutesRemaining }, { status: 429 });
  }

  const userLookupPromise = (async () => {
    const result = await supabaseServer.from("login_users").select("*").eq("emp_id", empId).maybeSingle();
    stamp("login_user_loaded");
    return result;
  })();

  const employeeLookupPromise = (async () => {
    const result = await supabaseServer
      .from("employees")
      .select("status")
      .eq("employee_code", empId)
      .maybeSingle();
    stamp("employee_loaded");
    return result;
  })();

  const [userResult, employeeResult] = await Promise.all([userLookupPromise, employeeLookupPromise]);
  const { data: user, error: userQueryError } = userResult;
  const { data: emp, error: empQueryError } = employeeResult;

  if (userQueryError) {
    console.error("login login_users query failed:", userQueryError.message);
    logTiming("DB_QUERY_FAILED_LOGIN_USERS");
    return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  if (!user) {
    logTiming("USER_NOT_FOUND");
    return json({ error: "USER_NOT_FOUND" }, { status: 400 });
  }

  if (empQueryError) {
    console.error("login employees query failed:", empQueryError.message);
    logTiming("DB_QUERY_FAILED_EMPLOYEES");
    return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  if (!emp) {
    logTiming("EMPLOYEE_NOT_FOUND");
    return json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });
  }

  if (emp.status !== "active") {
    logTiming("ACCOUNT_BLOCKED");
    return json({ error: "ACCOUNT_BLOCKED", reason: emp.status }, { status: 403 });
  }

  if (!user.pin_hash) {
    logTiming("PIN_NOT_SET");
    return json({ error: "PIN_NOT_SET", message: "Please set your PIN first" }, { status: 400 });
  }

  const validPin = await bcrypt.compare(rawPin, user.pin_hash);
  stamp("pin_compared");

  if (!validPin) {
    await recordLoginAttempt(supabaseServer, empId, false, ipAddress);
    stamp("failed_attempt_recorded");
    logTiming("INVALID_PIN");
    return json({ error: "INVALID_PIN" }, { status: 400 });
  }

  const mustChangePin = Boolean(user.force_pin_change);
  if (mustChangePin && user.temp_pin_expires_at && new Date(user.temp_pin_expires_at) < new Date()) {
    logTiming("TEMP_PIN_EXPIRED");
    return json({ error: "TEMP_PIN_EXPIRED" }, { status: 400 });
  }

  const recordAttemptPromise = recordLoginAttempt(supabaseServer, empId, true, ipAddress);
  const clearFailedPromise = clearFailedAttempts(supabaseServer, empId);

  const sessionToken = createSessionToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

  const { error: sessionError } = await supabaseServer.from("sessions").insert({
    session_token: sessionToken,
    emp_id: empId,
    role: user.role,
    expires_at: expiresAt,
    is_active: true,
    login_context: EMPLOYEE_PORTAL,
    ip_address: ipAddress,
    user_agent: request.headers.get("user-agent") || null,
  });
  stamp("session_inserted");

  await Promise.all([recordAttemptPromise, clearFailedPromise]);
  stamp("attempt_logs_completed");

  if (sessionError) {
    console.error("login session insert failed:", sessionError.message);
    logTiming("SESSION_CREATE_FAILED");
    return json({ error: "SESSION_CREATE_FAILED" }, { status: 500 });
  }

  logTiming("SUCCESS");

  return json(
    {
      success: true,
      role: user.role,
      status: emp.status,
      session_token: sessionToken,
      login_context: EMPLOYEE_PORTAL,
      must_change_pin: mustChangePin,
    },
    {
      status: 200,
      headers: {
        "Set-Cookie": await sessionTokenCookie.serialize(sessionToken),
      },
    }
  );
}


