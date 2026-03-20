import { supabaseServer } from "@/lib/supabaseServer";
import { normalizeLoginContext } from "@/lib/sessionContext";

function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((s) => s.trim());
  for (const part of parts) {
    const [k, ...rest] = part.split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

/**
 * Validates a session token from the Authorization header.
 * @param {Request} req
 * @returns {Promise<{ session: object|null, error: string|null, status: number }>}
 */
export async function validateSession(req) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { session: null, error: "MISSING_SESSION_TOKEN", status: 401 };
  }

  const token = authHeader.slice(7);
  const headerDeviceId = req.headers.get("x-device-id")?.trim();
  const deviceId = headerDeviceId || getCookieValue(req.headers.get("cookie"), "tdone_device_id");
  if (!deviceId) {
    return { session: null, error: "MISSING_DEVICE_ID", status: 401 };
  }

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
    await supabaseServer
      .from("sessions")
      .update({ is_active: false })
      .eq("id", data.id);
    return { session: null, error: "SESSION_EXPIRED", status: 401 };
  }

  // Device binding (system-wide)
  if (data.device_id) {
    if (String(data.device_id) !== deviceId) {
      return { session: null, error: "DEVICE_MISMATCH", status: 403 };
    }
  } else {
    // Backfill device_id for legacy sessions if and only if the device is
    // already trusted (active employee_devices row).
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
      .select("id")
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
