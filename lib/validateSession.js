import { getPrisma } from "@/lib/prisma";
import { getRequestCloudflareEnv } from "@/lib/requestContext";
import { ADMIN_PORTAL, normalizeLoginContext } from "@/lib/sessionContext";

function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((s) => s.trim());
  for (const part of parts) {
    const [k, ...rest] = part.split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function parseSessionTokenCookie(cookieHeader) {
  const rawCookieValue = getCookieValue(cookieHeader, "tdone_session_token");
  if (!rawCookieValue) return null;

  try {
    return JSON.parse(Buffer.from(rawCookieValue, "base64").toString("utf8"));
  } catch {
    return rawCookieValue;
  }
}

function resolvePrismaEnv(req, context) {
  const requestEnv = getRequestCloudflareEnv(req) || {};
  const contextEnv = context?.cloudflare?.env || {};
  const databaseUrl =
    requestEnv.DATABASE_URL ||
    contextEnv.DATABASE_URL ||
    process.env.DATABASE_URL;

  return {
    ...contextEnv,
    ...requestEnv,
    DATABASE_URL: databaseUrl,
  };
}

/**
 * Validates a session token from the Authorization header.
 * @param {Request} req
 * @param {unknown} context
 * @returns {Promise<{ session: object|null, error: string|null, status: number }>}
 */
export async function validateSession(req, context) {
  const prisma = getPrisma(resolvePrismaEnv(req, context));
  const authHeader = req.headers.get("authorization");
  const cookieToken = parseSessionTokenCookie(req.headers.get("cookie"));
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : cookieToken;

  if (!token) {
    return { session: null, error: "MISSING_SESSION_TOKEN", status: 401 };
  }
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
    const mappingRows = await prisma.$queryRaw`
      SELECT employee_uuid
      FROM employee_uuid_mappings
      WHERE employee_code = ${data.emp_id}
      LIMIT 1
    `;

    const employeeUuid = Array.isArray(mappingRows) ? mappingRows[0]?.employee_uuid : null;

    if (!employeeUuid) {
      return { session: null, error: "EMPLOYEE_NOT_FOUND", status: 403 };
    }

    const boundDevice = await prisma.authEmployeeDevice.findFirst({
      where: { employee_id: employeeUuid, device_id: deviceId, is_active: true },
      select: { id: true },
    });

    if (!boundDevice) {
      return { session: null, error: "DEVICE_NOT_TRUSTED", status: 403 };
    }

    await prisma.authSession.update({ where: { id: data.id }, data: { device_id: deviceId } });
  }

  const loginContext = normalizeLoginContext(data.login_context);

  return {
    session: {
      id: data.id,
      emp_id: data.emp_id,
      role: data.role,
      login_context: loginContext,
      is_admin: loginContext === ADMIN_PORTAL || ["admin", "super_admin"].includes(String(data.role || "").trim().toLowerCase()),
    },
    error: null,
    status: 200,
  };
}
