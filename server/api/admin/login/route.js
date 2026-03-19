import bcrypt from "bcryptjs";
import crypto from "crypto";
import { supabaseServer } from "@/lib/supabaseServer";
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
  "settings.work_location.manage",
  "settings.rich_menu.manage",
  "audit.read.pin_reset",
  "rbac.manage",
];

export async function POST(req) {
  try {
    const { email, password } = await req.json();
    const normalizedEmail = String(email || "").trim().toLowerCase();
    const rawPassword = String(password || "").trim();

    if (!normalizedEmail || !rawPassword) {
      return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const { data: user, error: userError } = await supabaseServer
      .from("login_users")
      .select("emp_id, role, admin_email, admin_password_hash")
      .eq("admin_email", normalizedEmail)
      .maybeSingle();

    if (userError) {
      return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
    }

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

    const { data: employee, error: employeeError } = await supabaseServer
      .from("employees")
      .select("status")
      .eq("employee_code", user.emp_id)
      .maybeSingle();

    if (employeeError) {
      return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
    }

    if (!employee) {
      return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });
    }

    if (employee.status !== "active") {
      return Response.json({ error: "ACCOUNT_BLOCKED", reason: employee.status }, { status: 403 });
    }

    const sessionToken = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

    const { error: sessionError } = await supabaseServer
      .from("sessions")
      .insert({
        session_token: sessionToken,
        emp_id: user.emp_id,
        role: user.role,
        expires_at: expiresAt,
        is_active: true,
        login_context: ADMIN_PORTAL,
        user_agent: req.headers.get("user-agent") || null,
      });

    if (sessionError) {
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
