import { Client } from "pg";
import { getSessionTokenFromRequest } from "~/lib/session-cookie.server";
import { ADMIN_PORTAL, normalizeLoginContext } from "~/lib/session-context";
import { getDeviceIdFromRequest } from "~/lib/device-cookie.server";

const ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "hr_payroll",
  "hr-payroll",
  "hr payroll",
  "hrpayroll",
]);

const RETRYABLE_DB_ERROR_CODES = new Set(["53300", "57P03"]);

type CloudflareContext = {
  cloudflare?: {
    env?: Record<string, unknown>;
  };
};

type SessionRow = {
  id: string;
  emp_id: string;
  role: string | null;
  device_id: string | null;
  expires_at: string | Date;
  login_context: string | null;
};

function isRetryableDbError(error: unknown) {
  const code = String((error as { code?: string })?.code || "");
  const message = String((error as { message?: string })?.message || "").toLowerCase();
  if (RETRYABLE_DB_ERROR_CODES.has(code)) return true;
  return (
    message.includes("connection terminated unexpectedly") ||
    message.includes("too many connections") ||
    message.includes("remaining connection slots")
  );
}

function getConnectionString(context: unknown) {
  const env = (context as CloudflareContext | undefined)?.cloudflare?.env ?? {};
  return (
    ((env.HYPERDRIVE as { connectionString?: string } | undefined)?.connectionString) ||
    (typeof env.DATABASE_URL === "string" ? env.DATABASE_URL : null) ||
    process.env.DATABASE_URL ||
    null
  );
}

async function withPgClient<T>(connectionString: string, fn: (client: Client) => Promise<T>, retries = 1): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const client = new Client({ connectionString });
    try {
      await client.connect();
      const result = await fn(client);
      await client.end().catch(() => {});
      return result;
    } catch (error) {
      lastError = error;
      await client.end().catch(() => {});
      if (!isRetryableDbError(error) || attempt === retries) break;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  throw lastError;
}

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
    return { session: null, error: "SESSION_VALIDATION_FAILED", status: 500 };
  }

  let data: SessionRow | null = null;
  try {
    data = await withPgClient(
      connectionString,
      async (client) => {
        const result = await client.query<SessionRow>(
          `SELECT id, emp_id, role, device_id, expires_at, login_context
           FROM auth_sessions
           WHERE session_token = $1 AND is_active = true
           LIMIT 1`,
          [token],
        );
        return result.rows[0] || null;
      },
      1,
    );
  } catch (dbError) {
    console.error("validateSession DB error:", dbError);
    return { session: null, error: "SESSION_VALIDATION_FAILED", status: 500 };
  }

  if (!data) {
    return { session: null, error: "INVALID_SESSION", status: 401 };
  }

  if (new Date(data.expires_at) < new Date()) {
    try {
      await withPgClient(
        connectionString,
        async (client) => {
          await client.query(`UPDATE auth_sessions SET is_active = false WHERE id = $1`, [data.id]);
        },
        0,
      );
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
      const isTrustedDevice = await withPgClient(
        connectionString,
        async (client) => {
          const employeeResult = await client.query<{ id: string }>(
            `SELECT id FROM employees WHERE employee_code = $1 LIMIT 1`,
            [data.emp_id],
          );
          const employeeId = employeeResult.rows[0]?.id;
          if (!employeeId) {
            return { trusted: false, reason: "EMPLOYEE_NOT_FOUND" };
          }

          const deviceResult = await client.query<{ id: string }>(
            `SELECT id
             FROM auth_employee_devices
             WHERE employee_id = $1 AND device_id = $2 AND is_active = true
             LIMIT 1`,
            [employeeId, deviceId],
          );

          if (!deviceResult.rows[0]?.id) {
            return { trusted: false, reason: "DEVICE_NOT_TRUSTED" };
          }

          await client.query(`UPDATE auth_sessions SET device_id = $1 WHERE id = $2`, [deviceId, data.id]);
          return { trusted: true as const };
        },
        1,
      );

      if (!isTrustedDevice.trusted) {
        return { session: null, error: isTrustedDevice.reason, status: 403 };
      }
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
