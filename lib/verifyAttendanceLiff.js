import { supabaseServer } from "@/lib/supabaseServer";
import { verifyLineIdToken } from "@/lib/verifyLineIdToken";

export async function verifyAttendanceLiffBySession(req, sessionEmpId) {
  const allowDevBypass = process.env.ATTENDANCE_ALLOW_DEV_WITHOUT_LIFF === "true";
  if (allowDevBypass && process.env.NODE_ENV !== "production") {
    return { ok: true, line_user_id: null, dev_bypass: true };
  }

  const idToken = req.headers.get("x-line-id-token") || "";
  if (!idToken) {
    return { ok: false, status: 401, error: "MISSING_LINE_ID_TOKEN" };
  }

  const { data: loginUser, error: loginError } = await supabaseServer
    .from("login_users")
    .select("line_user_id")
    .eq("emp_id", sessionEmpId)
    .maybeSingle();

  if (loginError) {
    return { ok: false, status: 500, error: "LOGIN_USER_QUERY_FAILED", detail: loginError.message };
  }

  const lineUserId = loginUser?.line_user_id;
  if (!lineUserId) {
    return { ok: false, status: 401, error: "LINE_NOT_LINKED" };
  }

  const tokenCheck = await verifyLineIdToken({
    idToken,
    expectedUserId: lineUserId,
  });

  if (!tokenCheck.ok) {
    return {
      ok: false,
      status: 401,
      error: tokenCheck.error,
      detail: tokenCheck.detail || null,
    };
  }

  return { ok: true, line_user_id: lineUserId };
}
