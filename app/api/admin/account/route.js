import bcrypt from "bcryptjs";
import { supabaseServer } from "@/lib/supabaseServer";
import { validateSession } from "@/lib/validateSession";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";
import { ADMIN_PORTAL, isPortalContextAllowed } from "@/lib/sessionContext";

const REQUIRED_PERMISSIONS = ["rbac.manage", "security.pin.reset.manage"];

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  if (!isPortalContextAllowed(session, [ADMIN_PORTAL])) {
    return Response.json({ error: "FORBIDDEN_PORTAL_CONTEXT" }, { status: 403 });
  }

  const accessProfile = buildSessionAccessProfile(session);
  if (!hasAnyPermission(accessProfile, REQUIRED_PERMISSIONS)) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { emp_id, admin_email, admin_password } = await req.json();
  const targetEmpId = String(emp_id || "").trim().toUpperCase();
  const adminEmail = String(admin_email || "").trim().toLowerCase();
  const adminPassword = String(admin_password || "").trim();

  if (!targetEmpId || !adminEmail || adminPassword.length < 8) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(adminEmail)) {
    return Response.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }

  const { data: targetUser, error: targetError } = await supabaseServer
    .from("login_users")
    .select("emp_id")
    .eq("emp_id", targetEmpId)
    .maybeSingle();

  if (targetError) {
    return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  if (!targetUser) {
    return Response.json({ error: "USER_NOT_FOUND" }, { status: 404 });
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);
  const { error: updateError } = await supabaseServer
    .from("login_users")
    .update({
      admin_email: adminEmail,
      admin_password_hash: passwordHash,
    })
    .eq("emp_id", targetEmpId);

  if (updateError) {
    if (String(updateError.message || "").toLowerCase().includes("duplicate")) {
      return Response.json({ error: "EMAIL_ALREADY_USED" }, { status: 409 });
    }
    return Response.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  return Response.json({
    success: true,
    emp_id: targetEmpId,
    admin_email: adminEmail,
  });
}
