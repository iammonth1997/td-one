import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getPrisma } from "@/lib/prisma";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";
import { ADMIN_PORTAL } from "@/lib/sessionContext";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((s) => s.trim());
  for (const part of parts) {
    const [k, ...rest] = part.split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

const ADMIN_UI_PERMISSIONS = [
  "leave.approve.section",
  "leave.approve.department",
  "leave.approve.company",
  "ot.approve.section",
  "ot.approve.department",
  "ot.approve.company",
  "settings.work_location.manage",
  "settings.rich_menu.manage",
  "audit.read.pin_reset",
  "rbac.manage",
];

export async function POST(req, context) {
  const env = context?.cloudflare?.env ?? { DATABASE_URL: process.env.DATABASE_URL };
  const prisma = getPrisma(env);

  try {
    const { email, password } = await req.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const rawPassword = String(password || "").trim();

    if (!normalizedEmail || !rawPassword) {
      return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    // admin_email and admin_password_hash are not yet in the Prisma schema;
    // use raw SQL to look up the admin login record.
    let userRows;
    try {
      userRows = await prisma.$queryRaw`
        SELECT emp_id, role, admin_email, admin_password_hash
        FROM login_users
        WHERE admin_email = ${normalizedEmail}
        LIMIT 1
      `;
    } catch {
      return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
    }

    const user = userRows[0] || null;

    if (!user || !user.admin_password_hash) {
      return Response.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
    }

    const passwordMatched = await bcrypt.compare(rawPassword, user.admin_password_hash);
    if (!passwordMatched) {
      return Response.json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
    }

    const accessProfile = buildSessionAccessProfile({ role: user.role });
    if (!hasAnyPermission(accessProfile, ADMIN_UI_PERMISSIONS)) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    let employee;
    try {
      employee = await prisma.employee.findFirst({
        where: { employee_id: user.emp_id },
        select: { status: true },
      });
    } catch {
      return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
    }

    if (!employee) {
      return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });
    }

    // Supports legacy Thai status and normalized active status.
    if (employee.status !== "active" && employee.status !== "\u0e1e\u0e19\u0e31\u0e01\u0e07\u0e32\u0e19") {
      return Response.json({ error: "ACCOUNT_BLOCKED", reason: employee.status }, { status: 403 });
    }

    const deviceId =
      getCookieValue(req.headers.get("cookie"), "tdone_device_id") || req.headers.get("x-device-id")?.trim();
    if (!deviceId) {
      return Response.json({ error: "MISSING_DEVICE_ID" }, { status: 401 });
    }

    const sessionToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    try {
      await prisma.authSession.create({
        data: {
          session_token: sessionToken,
          emp_id: user.emp_id,
          role: user.role,
          device_id: deviceId,
          expires_at: expiresAt,
          is_active: true,
          login_context: ADMIN_PORTAL,
          user_agent: req.headers.get("user-agent") || null,
        },
      });
    } catch {
      return Response.json({ error: "SESSION_CREATE_FAILED" }, { status: 500 });
    }

    return Response.json({
      success: true,
      emp_id: user.emp_id,
      role: user.role,
      status: employee.status,
      session_token: sessionToken,
      login_context: ADMIN_PORTAL,
      must_change_pin: false,
    });
  } catch (error) {
    return Response.json({ error: "ADMIN_LOGIN_FAILED", detail: String(error?.message || error) }, { status: 500 });
  }
}
