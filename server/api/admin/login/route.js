import bcrypt from "bcryptjs";
import crypto from "crypto";
import { Client } from "pg";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";
import { ADMIN_PORTAL } from "@/lib/sessionContext";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

const ADMIN_UI_PERMISSIONS = [
  "leave.approve.section",
  "leave.approve.department",
  "leave.approve.company",
  "ot.approve.section",
  "ot.approve.department",
  "ot.approve.company",
  "attendance.edit.department",
  "attendance.edit.all",
  "employee.manage.department",
  "employee.manage.all",
  "time_correction.read.all",
  "recruitment.manage",
  "payroll.read.full",
  "security.pin.reset.manage",
  "security.session.revoke",
  "audit.read.all",
  "settings.work_location.manage",
  "settings.rich_menu.manage",
  "audit.read.pin_reset",
  "rbac.manage",
];

const RETRYABLE_DB_ERROR_CODES = new Set(["53300", "57P03"]);

function normalizeRoleKey(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function isHrRole(value) {
  return normalizeRoleKey(value).startsWith("HR_");
}

function canAccessRequestAdminRole(role) {
  const roleKey = normalizeRoleKey(role);
  return roleKey === "DEPT_ADMIN" || roleKey === "SUPER_ADMIN" || roleKey === "ADMIN" || isHrRole(roleKey);
}

function canAccessAdminPortal(role, accessProfile) {
  return canAccessRequestAdminRole(role) || hasAnyPermission(accessProfile, ADMIN_UI_PERMISSIONS);
}

function isRetryableDbError(error) {
  const code = String(error?.code || "");
  const message = String(error?.message || "").toLowerCase();
  if (RETRYABLE_DB_ERROR_CODES.has(code)) return true;
  return (
    message.includes("connection terminated unexpectedly") ||
    message.includes("too many connections") ||
    message.includes("remaining connection slots")
  );
}

function getConnectionString(context) {
  const env = context?.cloudflare?.env ?? {};
  return env.HYPERDRIVE?.connectionString || env.DATABASE_URL || process.env.DATABASE_URL || null;
}

function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((s) => s.trim());
  for (const part of parts) {
    const [k, ...rest] = part.split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

async function withPgClient(connectionString, fn, retries = 1) {
  let lastError = null;

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

export async function POST(req, context) {
  try {
    const connectionString = getConnectionString(context);
    if (!connectionString) {
      return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
    }

    const { email, password } = await req.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const rawPassword = String(password || "").trim();

    if (!normalizedEmail || !rawPassword) {
      return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    let userRow = null;
    try {
      userRow = await withPgClient(
        connectionString,
        async (client) => {
          const result = await client.query(
            `SELECT emp_id, role, admin_email, admin_password_hash
             FROM login_users
             WHERE LOWER(TRIM(admin_email)) = $1
             LIMIT 1`,
            [normalizedEmail],
          );
          return result.rows[0] || null;
        },
        1,
      );
    } catch (dbError) {
      return Response.json(
        {
          error: "DB_QUERY_FAILED",
          detail: String(dbError?.message || dbError),
        },
        { status: 500 },
      );
    }

    if (!userRow) {
      return Response.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
    }

    if (!userRow.admin_password_hash) {
      return Response.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
    }

    const passwordMatched = await bcrypt.compare(rawPassword, userRow.admin_password_hash);
    if (!passwordMatched) {
      return Response.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
    }

    const accessProfile = buildSessionAccessProfile({ role: userRow.role });
    if (!canAccessAdminPortal(userRow.role, accessProfile)) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const deviceId =
      getCookieValue(req.headers.get("cookie"), "tdone_device_id") || req.headers.get("x-device-id")?.trim();
    if (!deviceId) {
      return Response.json({ error: "MISSING_DEVICE_ID" }, { status: 401 });
    }

    const sessionToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    const inserted = await withPgClient(
      connectionString,
      async (client) => {
        await client.query(
          `INSERT INTO auth_sessions (
              id,
              session_token,
              emp_id,
              role,
              device_id,
              expires_at,
              is_active,
              login_context,
              ip_address,
              user_agent
            ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            crypto.randomUUID(),
            sessionToken,
            userRow.emp_id,
            userRow.role,
            deviceId,
            expiresAt,
            true,
            ADMIN_PORTAL,
            null,
            req.headers.get("user-agent") || null,
          ],
        );
        return true;
      },
      1,
    ).catch(() => false);

    if (!inserted) {
      return Response.json({ error: "SESSION_CREATE_FAILED" }, { status: 500 });
    }

    return Response.json({
      success: true,
      emp_id: userRow.emp_id,
      role: userRow.role,
      status: "active",
      session_token: sessionToken,
      login_context: ADMIN_PORTAL,
      must_change_pin: false,
    });
  } catch (error) {
    return Response.json({ error: "ADMIN_LOGIN_FAILED", detail: String(error?.message || error) }, { status: 500 });
  }
}
