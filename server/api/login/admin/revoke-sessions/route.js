import { getPrisma } from "@/lib/prisma";
import { validateSession } from "@/lib/validateSession";
import { buildSessionAccessProfile, mapSessionRoleToAppRole } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";

export async function POST(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
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

  const targetUser = await prisma.loginUser.findFirst({
    where: { emp_id: targetEmpId },
    select: { emp_id: true, role: true },
  });

  if (!targetUser) {
    return Response.json({ error: "USER_NOT_FOUND" }, { status: 400 });
  }

  const isTargetSuperAdmin = mapSessionRoleToAppRole(targetUser.role) === "SUPER_ADMIN";
  const isRequesterSuperAdmin = mapSessionRoleToAppRole(session.role) === "SUPER_ADMIN";
  if (isTargetSuperAdmin && !isRequesterSuperAdmin) {
    return Response.json({ error: "CANNOT_REVOKE_SUPER_ADMIN" }, { status: 403 });
  }

  let result;
  try {
    result = await prisma.authSession.updateMany({
      where: { emp_id: targetEmpId, is_active: true },
      data: { is_active: false },
    });
  } catch (err) {
    console.error("revoke sessions failed:", err.message);
    return Response.json({ error: "REVOKE_FAILED" }, { status: 500 });
  }

  return Response.json({
    success: true,
    revoked_count: result.count,
  });
}
