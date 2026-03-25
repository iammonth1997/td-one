import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
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
  const targetEmpId    = String(emp_id        || "").trim().toUpperCase();
  const adminEmail     = String(admin_email   || "").trim().toLowerCase();
  const adminPassword  = String(admin_password || "").trim();

  if (!targetEmpId || !adminEmail || adminPassword.length < 8) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(adminEmail)) {
    return Response.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }

  // Verify target user exists
  const targetUser = await prisma.loginUser.findUnique({
    where:  { emp_id: targetEmpId },
    select: { emp_id: true },
  });

  if (!targetUser) {
    return Response.json({ error: "USER_NOT_FOUND" }, { status: 404 });
  }

  const passwordHash = await bcrypt.hash(adminPassword, 10);

  try {
    await prisma.loginUser.update({
      where: { emp_id: targetEmpId },
      data: {
        admin_email:         adminEmail,
        admin_password_hash: passwordHash,
      },
    });
  } catch (err) {
    if (err.code === "P2002") {
      return Response.json({ error: "EMAIL_ALREADY_USED" }, { status: 409 });
    }
    return Response.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  return Response.json({
    success:     true,
    emp_id:      targetEmpId,
    admin_email: adminEmail,
  });
}
