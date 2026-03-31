import bcrypt from "bcryptjs";
import crypto from "crypto";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";

// @ts-ignore legacy JS RBAC helper from app root
import { hasAnyPermission } from "@/lib/rbac/access";
// @ts-ignore legacy JS RBAC helper from app root
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
// @ts-ignore legacy JS session-context helper from app root
import { ADMIN_PORTAL } from "@/lib/sessionContext";
import { deviceIdCookie, getDeviceIdFromRequest } from "~/lib/device-cookie.server";
import prisma from "~/lib/prisma.server";
import { canAccessRequestAdmin } from "~/lib/request-types";
import { sessionTokenCookie } from "~/lib/session-cookie.server";

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
] as const;

function json(data: unknown, init?: ResponseInit) {
  return Response.json(data, init);
}

function canAccessAdminPortal(role: string | null) {
  const accessProfile = buildSessionAccessProfile({ role });
  return canAccessRequestAdmin(role, ADMIN_PORTAL) || hasAnyPermission(accessProfile, [...ADMIN_UI_PERMISSIONS]);
}

export async function loader(_args: LoaderFunctionArgs) {
  return json({ error: "METHOD_NOT_ALLOWED" }, { status: 405 });
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const payload = (await request.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
    const normalizedEmail = String(payload?.email || "").trim().toLowerCase();
    const rawPassword = String(payload?.password || "").trim();

    if (!normalizedEmail || !rawPassword) {
      return json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    let userRow: {
      emp_id: string;
      role: string;
      admin_email: string | null;
      admin_password_hash: string | null;
    } | null = null;

    try {
      userRow = await prisma.loginUser.findFirst({
        where: {
          admin_email: {
            equals: normalizedEmail,
            mode: "insensitive",
          },
        },
        select: {
          emp_id: true,
          role: true,
          admin_email: true,
          admin_password_hash: true,
        },
      });
    } catch (error) {
      console.error("admin login lookup failed:", error);
      return json(
        {
          error: "DB_QUERY_FAILED",
          detail: String((error as Error)?.message || error),
        },
        { status: 500 },
      );
    }

    if (!userRow?.admin_password_hash) {
      return json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
    }

    const passwordMatched = await bcrypt.compare(rawPassword, userRow.admin_password_hash);
    if (!passwordMatched) {
      return json({ error: "INVALID_CREDENTIALS" }, { status: 401 });
    }

    if (!canAccessAdminPortal(userRow.role)) {
      return json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const resolvedDeviceId = await getDeviceIdFromRequest(request);
    if (!resolvedDeviceId) {
      return json({ error: "MISSING_DEVICE_ID" }, { status: 401 });
    }

    const sessionToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    try {
      await prisma.authSession.create({
        data: {
          id: crypto.randomUUID(),
          session_token: sessionToken,
          emp_id: userRow.emp_id,
          role: userRow.role,
          device_id: resolvedDeviceId,
          expires_at: expiresAt,
          is_active: true,
          login_context: ADMIN_PORTAL,
          ip_address: null,
          user_agent: request.headers.get("user-agent") || null,
        },
      });
    } catch (error) {
      console.error("admin login session create failed:", error);
      return json(
        {
          error: "SESSION_CREATE_FAILED",
          detail: String((error as Error)?.message || error),
        },
        { status: 500 },
      );
    }

    const isHttps = new URL(request.url).protocol === "https:";
    const headers = new Headers();
    headers.append("Set-Cookie", await sessionTokenCookie.serialize(sessionToken, { secure: isHttps }));
    headers.append("Set-Cookie", await deviceIdCookie.serialize(resolvedDeviceId, { secure: isHttps }));

    return json(
      {
        success: true,
        emp_id: userRow.emp_id,
        role: userRow.role,
        status: "active",
        session_token: sessionToken,
        login_context: ADMIN_PORTAL,
        must_change_pin: false,
      },
      { headers },
    );
  } catch (error) {
    console.error("admin login failed:", error);
    return json(
      {
        error: "ADMIN_LOGIN_FAILED",
        detail: String((error as Error)?.message || error),
      },
      { status: 500 },
    );
  }
}
