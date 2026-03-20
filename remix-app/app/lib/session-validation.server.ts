import { getSessionTokenFromRequest } from "~/lib/session-cookie.server";
import { normalizeLoginContext } from "~/lib/session-context";
import { getSupabaseServerClient } from "~/lib/supabase.server";
import { getDeviceIdFromRequest } from "~/lib/device-cookie.server";

export async function validateSession(request: Request, context: unknown) {
  const token = await getSessionTokenFromRequest(request);
  if (!token) {
    return { session: null, error: "MISSING_SESSION_TOKEN", status: 401 };
  }

  const deviceId = await getDeviceIdFromRequest(request);
  if (!deviceId) {
    return { session: null, error: "MISSING_DEVICE_ID", status: 401 };
  }

  const { supabaseServer } = getSupabaseServerClient(context);

  const { data, error: dbError } = await supabaseServer
    .from("sessions")
    .select("id, emp_id, role, device_id, expires_at, is_active, login_context")
    .eq("session_token", token)
    .eq("is_active", true)
    .maybeSingle();

  if (dbError) {
    console.error("validateSession DB error:", dbError.message);
    return { session: null, error: "SESSION_VALIDATION_FAILED", status: 500 };
  }

  if (!data) {
    return { session: null, error: "INVALID_SESSION", status: 401 };
  }

  if (new Date(data.expires_at) < new Date()) {
    await supabaseServer.from("sessions").update({ is_active: false }).eq("id", data.id);
    return { session: null, error: "SESSION_EXPIRED", status: 401 };
  }

  // Device binding (system-wide): session token should only be usable from the
  // device that was trusted at session creation time.
  if (data.device_id) {
    if (String(data.device_id) !== deviceId) {
      return { session: null, error: "DEVICE_MISMATCH", status: 403 };
    }
  } else {
    // Backfill device_id for legacy sessions if (and only if) the device is
    // already bound to the employee as an active employee_devices row.
    const { data: empRow } = await supabaseServer
      .from("employees")
      .select("id")
      .eq("employee_code", data.emp_id)
      .maybeSingle();

    if (!empRow?.id) {
      return { session: null, error: "EMPLOYEE_NOT_FOUND", status: 403 };
    }

    const { data: boundDevice } = await supabaseServer
      .from("employee_devices")
      .select("id, is_active")
      .eq("employee_id", empRow.id)
      .eq("device_id", deviceId)
      .eq("is_active", true)
      .maybeSingle();

    if (!boundDevice) {
      return { session: null, error: "DEVICE_NOT_TRUSTED", status: 403 };
    }

    await supabaseServer.from("sessions").update({ device_id: deviceId }).eq("id", data.id);
  }

  return {
    session: {
      id: data.id,
      emp_id: data.emp_id,
      role: data.role,
      login_context: normalizeLoginContext(data.login_context),
    },
    error: null,
    status: 200,
  };
}
