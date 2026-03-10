import crypto from "crypto";
import bcrypt from "bcryptjs";
import { supabaseServer } from "@/lib/supabaseServer";
import { validateSession } from "@/lib/validateSession";

const ISSUE_ALLOWED_ROLES = new Set([
  "super_admin",
  "hr_payroll",
  "hr-payroll",
  "hr payroll",
  "hrpayroll",
]);

const TEMP_PIN_TTL_MINUTES = 15;

function canIssueTempPin(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return ISSUE_ALLOWED_ROLES.has(normalized);
}

function generateTempPin() {
  const bytes = crypto.randomBytes(4).readUInt32BE(0);
  const num = bytes % 1000000;
  return String(num).padStart(6, "0");
}

function getClientIp(req) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || null;
}

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  if (!canIssueTempPin(session.role)) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { emp_id } = await req.json();
  const targetEmpId = String(emp_id || "").trim().toUpperCase();
  if (!targetEmpId) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const { data: targetUser, error: targetUserError } = await supabaseServer
    .from("login_users")
    .select("emp_id")
    .eq("emp_id", targetEmpId)
    .maybeSingle();

  if (targetUserError) {
    console.error("issue temp pin login_users query failed:", targetUserError.message);
    return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  if (!targetUser) {
    return Response.json({ error: "USER_NOT_FOUND" }, { status: 400 });
  }

  const tempPin = generateTempPin();
  const pinHash = await bcrypt.hash(tempPin, 10);
  const expiresAt = new Date(Date.now() + TEMP_PIN_TTL_MINUTES * 60 * 1000).toISOString();

  const { error: updateError } = await supabaseServer
    .from("login_users")
    .update({
      pin_hash: pinHash,
      is_registered: true,
      force_pin_change: true,
      temp_pin_expires_at: expiresAt,
      temp_pin_issued_at: new Date().toISOString(),
      temp_pin_issued_by: session.emp_id,
    })
    .eq("emp_id", targetEmpId);

  if (updateError) {
    console.error("issue temp pin update failed:", updateError.message);
    return Response.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  const ipAddress = getClientIp(req);
  const userAgent = req.headers.get("user-agent") || null;
  const { error: auditError } = await supabaseServer
    .from("pin_reset_audit")
    .insert({
      target_emp_id: targetEmpId,
      reset_by_emp_id: session.emp_id,
      reset_by_role: session.role,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

  if (auditError) {
    console.error("issue temp pin audit insert failed:", auditError.message);
  }

  return Response.json({
    success: true,
    emp_id: targetEmpId,
    temp_pin: tempPin,
    expires_at: expiresAt,
  });
}
