import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { validateSession } from "@/lib/validateSession";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";

const SECRET = process.env.RESET_PIN_SECRET || "td-one-reset-pin-secret-2026";

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
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const accessProfile = buildSessionAccessProfile(session);

  if (!hasAnyPermission(accessProfile, ["security.pin.reset.manage", "rbac.manage"])) {
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
  const emp = await prisma.employee.findFirst({
    where: { employee_code: empId },
    select: { status: true },
  });

  if (!emp || emp.status !== "active") {
    return Response.json({ error: "ACCOUNT_BLOCKED" }, { status: 403 });
  }

  // Hash new PIN
  const salt = await bcrypt.genSalt(10);
  const pin_hash = await bcrypt.hash(rawPin, salt);

  // Update login_users — includes fields not yet in the Prisma schema
  // (is_registered, temp_pin_issued_at, temp_pin_issued_by). Raw SQL is used
  // so that all columns are written atomically.
  try {
    await prisma.$executeRaw`
      UPDATE login_users SET
        pin_hash            = ${pin_hash},
        force_pin_change    = false,
        temp_pin_expires_at = NULL,
        temp_pin_issued_at  = NULL,
        temp_pin_issued_by  = NULL,
        is_registered       = true,
        updated_at          = NOW()
      WHERE emp_id = ${empId}
    `;
  } catch (err) {
    console.error("reset-pin update failed:", err.message);
    return Response.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  const ipAddress = getClientIp(req);
  const userAgent = req.headers.get("user-agent") || null;

  // pin_reset_audit table is not yet in the Prisma schema; use raw SQL
  try {
    await prisma.$executeRaw`
      INSERT INTO pin_reset_audit (target_emp_id, reset_by_emp_id, reset_by_role, ip_address, user_agent)
      VALUES (${empId}, ${session.emp_id}, ${session.role}, ${ipAddress}, ${userAgent})
    `;
  } catch (err) {
    console.error("pin reset audit insert failed:", err.message);
  }

  return Response.json({ success: true });
}
