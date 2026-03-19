import bcrypt from "bcryptjs";
import crypto from "crypto";
import { supabaseServer } from "@/lib/supabaseServer";
import { verifyLineIdToken } from "@/lib/verifyLineIdToken";
import { EMPLOYEE_PORTAL } from "@/lib/sessionContext";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

export async function POST(req) {
  try {
    const { emp_id, pin, line_user_id, id_token } = await req.json();
    const empId = String(emp_id || "").trim().toUpperCase();
    const rawPin = String(pin || "").trim();
    const lineUserId = String(line_user_id || "").trim();

    if (!empId || !rawPin || !lineUserId || !id_token) {
      return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const tokenCheck = await verifyLineIdToken({
      idToken: id_token,
      expectedUserId: lineUserId,
    });

    if (!tokenCheck.ok) {
      return Response.json({ error: tokenCheck.error, detail: tokenCheck.detail || null }, { status: 401 });
    }

    const { data: user, error: userError } = await supabaseServer
      .from("login_users")
      .select("emp_id, role, pin_hash, force_pin_change, temp_pin_expires_at, line_user_id")
      .eq("emp_id", empId)
      .maybeSingle();

    if (userError) {
      console.error("verify-pin user query failed:", userError.message);
      return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
    }

    if (!user) {
      return Response.json({ error: "USER_NOT_FOUND" }, { status: 400 });
    }

    const { data: emp, error: empError } = await supabaseServer
      .from("employees")
      .select("status")
      .eq("employee_code", empId)
      .maybeSingle();

    if (empError) {
      console.error("verify-pin employee query failed:", empError.message);
      return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
    }

    if (!emp) {
      return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });
    }

    if (emp.status !== "active") {
      return Response.json({ error: "ACCOUNT_BLOCKED", reason: emp.status }, { status: 403 });
    }

    if (!user.pin_hash) {
      return Response.json({ error: "PIN_NOT_SET" }, { status: 400 });
    }

    const validPin = await bcrypt.compare(rawPin, user.pin_hash);
    if (!validPin) {
      return Response.json({ error: "INVALID_PIN" }, { status: 400 });
    }

    const { data: linkedOtherUser, error: linkedOtherUserError } = await supabaseServer
      .from("login_users")
      .select("emp_id")
      .eq("line_user_id", lineUserId)
      .neq("emp_id", empId)
      .maybeSingle();

    if (linkedOtherUserError) {
      console.error("verify-pin line_user_id conflict query failed:", linkedOtherUserError.message);
      return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
    }

    if (linkedOtherUser) {
      return Response.json({ error: "LINE_ALREADY_LINKED" }, { status: 409 });
    }

    const { error: linkError } = await supabaseServer
      .from("login_users")
      .update({ line_user_id: lineUserId })
      .eq("emp_id", empId);

    if (linkError) {
      console.error("verify-pin line link update failed:", linkError.message);
      return Response.json({ error: "LINK_LINE_FAILED" }, { status: 500 });
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
        emp_id: empId,
        role: user.role,
        expires_at: expiresAt,
        is_active: true,
        login_context: EMPLOYEE_PORTAL,
        user_agent: req.headers.get("user-agent") || null,
      });

    if (sessionError) {
      console.error("verify-pin session insert failed:", sessionError.message);
      return Response.json({ error: "SESSION_CREATE_FAILED" }, { status: 500 });
    }

    return Response.json({
      success: true,
      emp_id: empId,
      role: user.role,
      status: emp.status,
      session_token: sessionToken,
      login_context: EMPLOYEE_PORTAL,
      must_change_pin: mustChangePin,
    });
  } catch (error) {
    return Response.json({ error: "VERIFY_PIN_FAILED", detail: String(error.message || error) }, { status: 500 });
  }
}
