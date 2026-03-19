import bcrypt from "bcryptjs";
import { supabaseServer } from "@/lib/supabaseServer";
import { validateSession } from "@/lib/validateSession";
import { ADMIN_PORTAL, isPortalContextAllowed } from "@/lib/sessionContext";

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  if (!isPortalContextAllowed(session, [ADMIN_PORTAL])) {
    return Response.json({ error: "FORBIDDEN_PORTAL_CONTEXT" }, { status: 403 });
  }

  const { old_password, new_password, confirm_password } = await req.json();
  const oldPassword = String(old_password || "").trim();
  const newPassword = String(new_password || "").trim();
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

  const { data: user, error: userError } = await supabaseServer
    .from("login_users")
    .select("emp_id, admin_password_hash")
    .eq("emp_id", session.emp_id)
    .maybeSingle();

  if (userError) {
    return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  if (!user || !user.admin_password_hash) {
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
  const { error: updateError } = await supabaseServer
    .from("login_users")
    .update({ admin_password_hash: newHash })
    .eq("emp_id", session.emp_id);

  if (updateError) {
    return Response.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  const { error: revokeError } = await supabaseServer
    .from("sessions")
    .update({ is_active: false })
    .eq("emp_id", session.emp_id)
    .eq("is_active", true)
    .neq("id", session.id);

  if (revokeError) {
    return Response.json({ error: "SESSION_REVOKE_FAILED" }, { status: 500 });
  }

  return Response.json({
    success: true,
    revoked_other_sessions: true,
  });
}
