import bcrypt from "bcryptjs";
import { getPrisma } from "@/lib/prisma";
import { validateSession } from "@/lib/validateSession";
import { ADMIN_PORTAL, isPortalContextAllowed } from "@/lib/sessionContext";

export async function POST(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  if (!isPortalContextAllowed(session, [ADMIN_PORTAL])) {
    return Response.json({ error: "FORBIDDEN_PORTAL_CONTEXT" }, { status: 403 });
  }

  const { old_password, new_password, confirm_password } = await req.json();
  const oldPassword     = String(old_password     || "").trim();
  const newPassword     = String(new_password     || "").trim();
  const confirmPassword = String(confirm_password || "").trim();

  if (!oldPassword || !newPassword || !confirmPassword) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  if (newPassword.length < 8) {
    return Response.json({ error: "WEAK_PASSWORD" }, { status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return Response.json({ error: "PASSWORD_MISMATCH" }, { status: 400 });
  }

  // Fetch admin account for the current session user
  const user = await prisma.loginUser.findUnique({
    where:  { emp_id: session.emp_id },
    select: { emp_id: true, admin_password_hash: true },
  });

  if (!user) {
    return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }
  if (!user.admin_password_hash) {
    return Response.json({ error: "ADMIN_ACCOUNT_NOT_FOUND" }, { status: 404 });
  }

  const oldPasswordMatched = await bcrypt.compare(oldPassword, user.admin_password_hash);
  if (!oldPasswordMatched) {
    return Response.json({ error: "INVALID_OLD_PASSWORD" }, { status: 401 });
  }

  const samePassword = await bcrypt.compare(newPassword, user.admin_password_hash);
  if (samePassword) {
    return Response.json({ error: "PASSWORD_UNCHANGED" }, { status: 400 });
  }

  const newHash = await bcrypt.hash(newPassword, 10);

  try {
    await prisma.loginUser.update({
      where: { emp_id: session.emp_id },
      data:  { admin_password_hash: newHash },
    });
  } catch {
    return Response.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  // Revoke all other active sessions for this user
  try {
    await prisma.authSession.updateMany({
      where: {
        emp_id:    session.emp_id,
        is_active: true,
        NOT:       { id: session.id },
      },
      data: { is_active: false },
    });
  } catch {
    return Response.json({ error: "SESSION_REVOKE_FAILED" }, { status: 500 });
  }

  return Response.json({
    success:               true,
    revoked_other_sessions: true,
  });
}
