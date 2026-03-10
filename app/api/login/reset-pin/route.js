import { isServiceRoleEnabled, supabaseServer } from "@/lib/supabaseServer";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { validateSession } from "@/lib/validateSession";

const SECRET = process.env.RESET_PIN_SECRET || "td-one-reset-pin-secret-2026";
const RESET_ALLOWED_ROLES = new Set(["hr_payroll", "hr-payroll", "hr payroll", "hrpayroll"]);

function canResetPin(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return RESET_ALLOWED_ROLES.has(normalized);
}

function verifyResetToken(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;

    const [payloadStr, signature] = parts;
    const expectedSig = crypto.createHmac("sha256", SECRET).update(payloadStr).digest("base64url");

    if (signature !== expectedSig) return null;

    const payload = JSON.parse(Buffer.from(payloadStr, "base64url").toString());

    if (Date.now() > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

function getClientIp(req) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || null;
}

export async function POST(req) {
  if (!isServiceRoleEnabled) {
    return Response.json(
      { error: "SERVER_CONFIG_MISSING", message: "SUPABASE_SERVICE_ROLE_KEY is required" },
      { status: 500 }
    );
  }

  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  if (!canResetPin(session.role)) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { token, new_pin } = await req.json();
  const rawToken = String(token || "").trim();
  const rawPin = String(new_pin || "").trim();

  if (!rawToken || !rawPin) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  if (rawPin.length < 4) {
    return Response.json({ error: "PIN_TOO_SHORT" }, { status: 400 });
  }

  // Verify the reset token
  const payload = verifyResetToken(rawToken);
  if (!payload) {
    return Response.json({ error: "INVALID_OR_EXPIRED_TOKEN" }, { status: 400 });
  }

  if (payload.issued_by && payload.issued_by !== session.emp_id) {
    return Response.json({ error: "TOKEN_ISSUER_MISMATCH" }, { status: 403 });
  }

  const empId = payload.emp_id;

  // Verify employee is still active
  const { data: emp } = await supabaseServer
    .from("employees")
    .select("status")
    .eq("employee_code", empId)
    .maybeSingle();

  if (!emp || emp.status !== "active") {
    return Response.json({ error: "ACCOUNT_BLOCKED" }, { status: 403 });
  }

  // Hash new PIN
  const salt = await bcrypt.genSalt(10);
  const pin_hash = await bcrypt.hash(rawPin, salt);

  // Update PIN in login_users
  const { error: updateError } = await supabaseServer
    .from("login_users")
    .update({
      pin_hash,
      force_pin_change: false,
      temp_pin_expires_at: null,
      temp_pin_issued_at: null,
      temp_pin_issued_by: null,
      is_registered: true,
    })
    .eq("emp_id", empId);

  if (updateError) {
    console.error("reset-pin update failed:", updateError.message);
    return Response.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  const ipAddress = getClientIp(req);
  const userAgent = req.headers.get("user-agent") || null;
  const { error: auditError } = await supabaseServer
    .from("pin_reset_audit")
    .insert({
      target_emp_id: empId,
      reset_by_emp_id: session.emp_id,
      reset_by_role: session.role,
      ip_address: ipAddress,
      user_agent: userAgent,
    });

  if (auditError) {
    console.error("pin reset audit insert failed:", auditError.message);
  }

  return Response.json({ success: true });
}
