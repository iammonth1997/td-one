import { supabaseServer } from "@/lib/supabaseServer";
import { validateSession } from "@/lib/validateSession";
import { buildSessionAccessProfile, mapSessionRoleToAppRole } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const accessProfile = buildSessionAccessProfile(session);

  if (!hasAnyPermission(accessProfile, ["security.session.revoke", "rbac.manage"])) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { emp_id } = await req.json();
  const targetEmpId = String(emp_id || "").trim().toUpperCase();

  if (!targetEmpId) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const { data: targetUser } = await supabaseServer
    .from("login_users")
    .select("emp_id, role")
    .eq("emp_id", targetEmpId)
    .maybeSingle();

  if (!targetUser) {
    return Response.json({ error: "USER_NOT_FOUND" }, { status: 400 });
  }

  const isTargetSuperAdmin = mapSessionRoleToAppRole(targetUser.role) === "SUPER_ADMIN";
  const isRequesterSuperAdmin = mapSessionRoleToAppRole(session.role) === "SUPER_ADMIN";
  if (isTargetSuperAdmin && !isRequesterSuperAdmin) {
    return Response.json({ error: "CANNOT_REVOKE_SUPER_ADMIN" }, { status: 403 });
  }

  const { data: revokedSessions, error: revokeError } = await supabaseServer
    .from("sessions")
    .update({ is_active: false })
    .eq("emp_id", targetEmpId)
    .eq("is_active", true)
    .select("id");

  if (revokeError) {
    console.error("revoke sessions failed:", revokeError.message);
    return Response.json({ error: "REVOKE_FAILED" }, { status: 500 });
  }

  return Response.json({
    success: true,
    revoked_count: revokedSessions?.length || 0,
  });
}
