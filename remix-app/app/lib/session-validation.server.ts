import { getDeviceIdFromRequest } from "~/lib/device-cookie.server";
import prisma from "~/lib/prisma.server";
import { getSessionTokenFromRequest } from "~/lib/session-cookie.server";
import { ADMIN_PORTAL, normalizeLoginContext } from "~/lib/session-context";

const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "hr_payroll",
  "hr-payroll",
  "hr payroll",
  "hrpayroll",
]);

type SessionRow = {
  id: string;
  emp_id: string;
  role: string | null;
  device_id: string | null;
  expires_at: string | Date;
  login_context: string | null;
};

export async function validateSession(request: Request, context: unknown) {
  const token = await getSessionTokenFromRequest(request);
  if (!token) {
    return { session: null, error: "MISSING_SESSION_TOKEN", status: 401 };
  }

  const deviceId = await getDeviceIdFromRequest(request);
  if (!deviceId) {
    return { session: null, error: "MISSING_DEVICE_ID", status: 401 };
  }

  let data: SessionRow | null = null;
  try {
    const result = await prisma.$queryRaw<SessionRow[]>`
      SELECT id, emp_id, role, device_id, expires_at, login_context
      FROM auth_sessions
      WHERE session_token = ${token} AND is_active = true
      LIMIT 1
    `;
    data = result[0] || null;
  } catch (dbError) {
    console.error("validateSession DB error:", dbError);
    return { session: null, error: "SESSION_VALIDATION_FAILED", status: 500 };
  }

  if (!data) {
    return { session: null, error: "INVALID_SESSION", status: 401 };
  }

  if (new Date(data.expires_at) < new Date()) {
    try {
      await prisma.$executeRaw`
        UPDATE auth_sessions
        SET is_active = false
        WHERE id = ${data.id}
      `;
    } catch (dbError) {
      console.error("validateSession expiry cleanup error:", dbError);
    }
    return { session: null, error: "SESSION_EXPIRED", status: 401 };
  }

  if (data.device_id && String(data.device_id) !== deviceId) {
    return { session: null, error: "DEVICE_MISMATCH", status: 403 };
  }

  if (!data.device_id) {
    try {
      const employeeResult = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM employees
        WHERE employee_id = ${data.emp_id}
        LIMIT 1
      `;
      const employeeId = employeeResult[0]?.id;
      if (!employeeId) {
        return { session: null, error: "EMPLOYEE_NOT_FOUND", status: 404 };
      }

      const deviceResult = await prisma.$queryRaw<{ id: string }[]>`
        SELECT id
        FROM auth_employee_devices
        WHERE employee_id = ${employeeId} AND device_id = ${deviceId} AND is_active = true
        LIMIT 1
      `;

      if (!deviceResult[0]?.id) {
        return { session: null, error: "DEVICE_NOT_TRUSTED", status: 403 };
      }

      await prisma.$executeRaw`
        UPDATE auth_sessions
        SET device_id = ${deviceId}
        WHERE id = ${data.id}
      `;

    } catch (dbError) {
      console.error("validateSession device check DB error:", dbError);
      return { session: null, error: "SESSION_VALIDATION_FAILED", status: 500 };
    }
  }

  const loginContext = normalizeLoginContext(data.login_context);
  const normalizedRole = String(data.role || "").trim().toLowerCase();

  return {
    session: {
      id: data.id,
      emp_id: data.emp_id,
      role: data.role,
      login_context: loginContext,
      is_admin: loginContext === ADMIN_PORTAL || ADMIN_ROLES.has(normalizedRole),
    },
    error: null,
    status: 200,
  };
}
