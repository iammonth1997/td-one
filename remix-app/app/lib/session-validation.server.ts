import { getDeviceIdFromRequest } from "~/lib/device-cookie.server";
import { getConnectionString, withPgClient } from "~/lib/pg.server";
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

  const connectionString = getConnectionString(context);
  if (!connectionString) {
    console.error("validateSession DB error: missing connection string");
    return { session: null, error: "SESSION_VALIDATION_FAILED", status: 500 };
  }

  let data: SessionRow | null = null;
  try {
    data = await withPgClient(connectionString, async (client) => {
      const result = await client.query<SessionRow>(
        `SELECT id, emp_id, role, device_id, expires_at, login_context
         FROM auth_sessions
         WHERE session_token = $1 AND is_active = true
         LIMIT 1`,
        [token],
      );
      return result.rows[0] || null;
    });
  } catch (dbError) {
    console.error("validateSession DB error:", dbError);
    return { session: null, error: "SESSION_VALIDATION_FAILED", status: 500 };
  }

  if (!data) {
    return { session: null, error: "INVALID_SESSION", status: 401 };
  }

  if (new Date(data.expires_at) < new Date()) {
    try {
      await withPgClient(connectionString, async (client) => {
        await client.query(
          `UPDATE auth_sessions
           SET is_active = false
           WHERE id = $1`,
          [data!.id],
        );
      });
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
      const employeeId = await withPgClient(connectionString, async (client) => {
        const employeeResult = await client.query<{ id: string }>(
          `SELECT id
           FROM employees
           WHERE employee_id = $1
           LIMIT 1`,
          [data!.emp_id],
        );
        return employeeResult.rows[0]?.id || null;
      });
      if (!employeeId) {
        return { session: null, error: "EMPLOYEE_NOT_FOUND", status: 404 };
      }

      const trustedDeviceId = await withPgClient(connectionString, async (client) => {
        const deviceResult = await client.query<{ id: string }>(
          `SELECT id
           FROM auth_employee_devices
           WHERE employee_id = $1 AND device_id = $2 AND is_active = true
           LIMIT 1`,
          [employeeId, deviceId],
        );
        return deviceResult.rows[0]?.id || null;
      });

      if (!trustedDeviceId) {
        return { session: null, error: "DEVICE_NOT_TRUSTED", status: 403 };
      }

      await withPgClient(connectionString, async (client) => {
        await client.query(
          `UPDATE auth_sessions
           SET device_id = $1
           WHERE id = $2`,
          [deviceId, data!.id],
        );
      });

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
