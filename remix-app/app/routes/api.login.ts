import bcrypt from "bcryptjs";
import type { ActionFunctionArgs } from "react-router";
import { clearFailedAttempts, checkRateLimit, recordLoginAttempt } from "~/lib/rate-limit.server";
import { sessionTokenCookie } from "~/lib/session-cookie.server";
import { EMPLOYEE_PORTAL } from "~/lib/session-context";
import { getSupabaseServerClient } from "~/lib/supabase.server";
import { writeAuditLog, AuditEvent } from "~/lib/audit-log.server";

// 30-day session as per device-trust architecture (NIST SP 800-63B)
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_DEVICES_PER_EMPLOYEE = 2;

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

  const body = (await request.json().catch(() => null)) as {
    emp_id?: string;
    pin?: string;
    password?: string;  // alias for pin (new API); both accepted
    device_id?: string;
    device_name?: string;
    platform?: string;
    app_version?: string;
  } | null;
  const empId = String(body?.emp_id || "").trim().toUpperCase();
  // Accept "password" or "pin" field for backward compatibility
  const rawPin = String(body?.password || body?.pin || "").trim();
  const deviceId = String(body?.device_id || "").trim() || null;
  const deviceName = String(body?.device_name || "").trim() || null;
  const platform = (["android", "ios", "web"].includes(body?.platform ?? "")) ? body!.platform! : "web";
  const appVersion = String(body?.app_version || "").trim() || null;
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
    await recordLoginAttempt(supabaseServer, empId, false, ipAddress);
    logTiming("USER_NOT_FOUND");
    return json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  if (empQueryError) {
    console.error("login employees query failed:", empQueryError.message);
    logTiming("DB_QUERY_FAILED_EMPLOYEES");
    return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  if (!emp) {
    await recordLoginAttempt(supabaseServer, empId, false, ipAddress);
    logTiming("EMPLOYEE_NOT_FOUND");
    return json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  if (emp.status !== "active") {
    logTiming("ACCOUNT_BLOCKED");
    return json({ error: "ACCOUNT_BLOCKED", reason: emp.status }, { status: 403 });
  }

  if (!user.pin_hash) {
    await recordLoginAttempt(supabaseServer, empId, false, ipAddress);
    logTiming("PIN_NOT_SET");
    return json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  const validPin = await bcrypt.compare(rawPin, user.pin_hash);
  stamp("pin_compared");

  if (!validPin) {
    await recordLoginAttempt(supabaseServer, empId, false, ipAddress);
    stamp("failed_attempt_recorded");
    logTiming("INVALID_PIN");
    // Audit log: login failed
    void writeAuditLog(supabaseServer, {
      event_type: AuditEvent.LOGIN_FAILED,
      severity: "warning",
      emp_id: empId,
      device_id: deviceId,
      ip_address: ipAddress,
      metadata: { reason: "INVALID_CREDENTIALS" },
    });
    return json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
  }

  const mustChangePin = Boolean(user.force_pin_change || user.must_change_password);
  if (mustChangePin && user.temp_pin_expires_at && new Date(user.temp_pin_expires_at) < new Date()) {
    logTiming("TEMP_PIN_EXPIRED");
    return json({ error: "TEMP_PIN_EXPIRED" }, { status: 400 });
  }

  // ─── Device Registration Check ───────────────────────────────────────────
  // Look up employee UUID (employee_devices uses UUID FK, login_users uses emp_code)
  let resolvedDeviceId = deviceId;
  if (deviceId) {
    const { data: empRow } = await supabaseServer
      .from("employees")
      .select("id")
      .eq("employee_code", empId)
      .maybeSingle();
    stamp("employee_uuid_loaded");

    if (empRow?.id) {
      const { data: existingDevice } = await supabaseServer
        .from("employee_devices")
        .select("id, is_active")
        .eq("employee_id", empRow.id)
        .eq("device_id", deviceId)
        .maybeSingle();
      stamp("device_lookup_done");

      if (existingDevice) {
        if (!existingDevice.is_active) {
          // Device was deactivated by admin
          logTiming("DEVICE_DEACTIVATED");
          void writeAuditLog(supabaseServer, {
            event_type: AuditEvent.UNREGISTERED_DEVICE_ATTEMPT,
            severity: "warning",
            emp_id: empId,
            device_id: deviceId,
            ip_address: ipAddress,
            metadata: { reason: "DEVICE_DEACTIVATED" },
          });
          return json({ error: "DEVICE_DEACTIVATED" }, { status: 403 });
        }
        // Known active device — update last_active_at
        void supabaseServer
          .from("employee_devices")
          .update({ last_active_at: new Date().toISOString() })
          .eq("id", existingDevice.id);
      } else {
        // New device — check limit
        const { count: deviceCount } = await supabaseServer
          .from("employee_devices")
          .select("id", { count: "exact", head: true })
          .eq("employee_id", empRow.id)
          .eq("is_active", true);
        stamp("device_count_checked");

        if ((deviceCount ?? 0) >= MAX_DEVICES_PER_EMPLOYEE) {
          logTiming("DEVICE_LIMIT_REACHED");
          void writeAuditLog(supabaseServer, {
            event_type: AuditEvent.DEVICE_LIMIT_REACHED,
            severity: "warning",
            emp_id: empId,
            device_id: deviceId,
            ip_address: ipAddress,
            metadata: { current_count: deviceCount, max: MAX_DEVICES_PER_EMPLOYEE },
          });
          return json(
            { error: "DEVICE_LIMIT_REACHED", message: "Maximum 2 devices allowed. Please deactivate an old device first." },
            { status: 403 }
          );
        }

        // Auto-register new device
        void supabaseServer.from("employee_devices").insert({
          employee_id: empRow.id,
          device_id: deviceId,
          device_name: deviceName,
          platform,
          app_version: appVersion,
          registered_at: new Date().toISOString(),
          last_active_at: new Date().toISOString(),
          is_active: true,
        });
        stamp("device_registered");

        void writeAuditLog(supabaseServer, {
          event_type: AuditEvent.DEVICE_REGISTERED,
          emp_id: empId,
          device_id: deviceId,
          ip_address: ipAddress,
          metadata: { device_name: deviceName, platform, app_version: appVersion },
        });
      }
    }
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
    device_id: resolvedDeviceId,
  });
  stamp("session_inserted");

  await Promise.all([recordAttemptPromise, clearFailedPromise]);
  stamp("attempt_logs_completed");

  if (sessionError) {
    console.error("login session insert failed:", sessionError.message);
    logTiming("SESSION_CREATE_FAILED");
    return json({ error: "SESSION_CREATE_FAILED" }, { status: 500 });
  }

  // Audit log: login success
  void writeAuditLog(supabaseServer, {
    event_type: AuditEvent.LOGIN_SUCCESS,
    emp_id: empId,
    device_id: resolvedDeviceId,
    ip_address: ipAddress,
    metadata: { role: user.role },
  });

  logTiming("SUCCESS");

  return json(
    {
      success: true,
      role: user.role,
      status: emp.status,
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


