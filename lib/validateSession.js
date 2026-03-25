import prisma from "@/lib/prisma";
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

  let data;
  try {
    data = await prisma.authSession.findFirst({
      where: { session_token: token, is_active: true },
      select: { id: true, emp_id: true, role: true, device_id: true, expires_at: true, is_active: true, login_context: true },
    });
  } catch (dbError) {
    console.error("validateSession DB error:", dbError.message);
    return { session: null, error: "SESSION_VALIDATION_FAILED", status: 500 };
  }

  if (!data) {
    return { session: null, error: "INVALID_SESSION", status: 401 };
  }

  if (new Date(data.expires_at) < new Date()) {
    await prisma.authSession.update({ where: { id: data.id }, data: { is_active: false } });
    return { session: null, error: "SESSION_EXPIRED", status: 401 };
  }

  if (data.device_id) {
    if (String(data.device_id) !== deviceId) {
      return { session: null, error: "DEVICE_MISMATCH", status: 403 };
    }
  } else {
    const empRow = await prisma.employee.findFirst({
      where: { employee_code: data.emp_id },
      select: { id: true },
    });

    if (!empRow?.id) {
      return { session: null, error: "EMPLOYEE_NOT_FOUND", status: 403 };
    }

    const boundDevice = await prisma.authEmployeeDevice.findFirst({
      where: { employee_id: empRow.id, device_id: deviceId, is_active: true },
      select: { id: true },
    });

    if (!boundDevice) {
      return { session: null, error: "DEVICE_NOT_TRUSTED", status: 403 };
    }

    await prisma.authSession.update({ where: { id: data.id }, data: { device_id: deviceId } });
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
