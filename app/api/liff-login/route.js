import crypto from "crypto";
import { supabaseServer } from "@/lib/supabaseServer";
import { verifyLineIdToken } from "@/lib/verifyLineIdToken";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

export async function POST(req) {
  try {
    const { line_user_id, id_token } = await req.json();
    const lineUserId = String(line_user_id || "").trim();
    const idToken = String(id_token || "").trim();

    if (!lineUserId || !idToken) {
      return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const tokenCheck = await verifyLineIdToken({
      idToken,
      expectedUserId: lineUserId,
    });

    if (!tokenCheck.ok) {
      return Response.json({ error: tokenCheck.error, detail: tokenCheck.detail || null }, { status: 401 });
    }

    const { data: user, error: userError } = await supabaseServer
      .from("login_users")
      .select("emp_id, role, force_pin_change, temp_pin_expires_at")
      .eq("line_user_id", lineUserId)
      .maybeSingle();

    if (userError) {
      console.error("liff-login user query failed:", userError.message);
      return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
    }

    if (!user) {
      return Response.json({ linked: false });
    }

    const { data: emp, error: empError } = await supabaseServer
      .from("employees")
      .select("status")
      .eq("employee_code", user.emp_id)
      .maybeSingle();

    if (empError) {
      console.error("liff-login employee query failed:", empError.message);
      return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
    }

    if (!emp) {
      return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });
    }

    if (emp.status !== "active") {
      return Response.json({ error: "ACCOUNT_BLOCKED", reason: emp.status }, { status: 403 });
    }

    const mustChangePin = Boolean(user.force_pin_change);
    if (mustChangePin && user.temp_pin_expires_at && new Date(user.temp_pin_expires_at) < new Date()) {
      return Response.json({ error: "TEMP_PIN_EXPIRED" }, { status: 400 });
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
        user_agent: req.headers.get("user-agent") || null,
      });

    if (sessionError) {
      console.error("liff-login session insert failed:", sessionError.message);
      return Response.json({ error: "SESSION_CREATE_FAILED" }, { status: 500 });
    }

    return Response.json({
      linked: true,
      emp_id: user.emp_id,
      role: user.role,
      status: emp.status,
      session_token: sessionToken,
      must_change_pin: mustChangePin,
    });
  } catch (error) {
    return Response.json({ error: "LIFF_LOGIN_FAILED", detail: String(error.message || error) }, { status: 500 });
  }
}
