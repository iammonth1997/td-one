import crypto from "crypto";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { validateSession } from "@/lib/validateSession";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";

const TEMP_PIN_TTL_MINUTES = 15;

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

  const accessProfile = buildSessionAccessProfile(session);

  if (!hasAnyPermission(accessProfile, ["security.pin.reset.manage", "rbac.manage"])) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { emp_id } = await req.json();
  const targetEmpId = String(emp_id || "").trim().toUpperCase();
  if (!targetEmpId) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  let targetUser;
  try {
    targetUser = await prisma.loginUser.findFirst({
      where: { emp_id: targetEmpId },
      select: { emp_id: true },
    });
  } catch (err) {
    console.error("issue temp pin login_users query failed:", err.message);
    return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  if (!targetUser) {
    return Response.json({ error: "USER_NOT_FOUND" }, { status: 400 });
  }

  const tempPin = generateTempPin();
  const pinHash = await bcrypt.hash(tempPin, 10);
  const expiresAt = new Date(Date.now() + TEMP_PIN_TTL_MINUTES * 60 * 1000);
  const issuedAt = new Date();

  // Update login_users — includes fields not yet in the Prisma schema
  // (is_registered, temp_pin_issued_at, temp_pin_issued_by). Raw SQL is used
  // so that all columns are written atomically.
  try {
    await prisma.$executeRaw`
      UPDATE login_users SET
        pin_hash            = ${pinHash},
        is_registered       = true,
        force_pin_change    = true,
        temp_pin_expires_at = ${expiresAt},
        temp_pin_issued_at  = ${issuedAt},
        temp_pin_issued_by  = ${session.emp_id},
        updated_at          = NOW()
      WHERE emp_id = ${targetEmpId}
    `;
  } catch (err) {
    console.error("issue temp pin update failed:", err.message);
    return Response.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  const ipAddress = getClientIp(req);
  const userAgent = req.headers.get("user-agent") || null;

  // pin_reset_audit table is not yet in the Prisma schema; use raw SQL
  try {
    await prisma.$executeRaw`
      INSERT INTO pin_reset_audit (target_emp_id, reset_by_emp_id, reset_by_role, ip_address, user_agent)
      VALUES (${targetEmpId}, ${session.emp_id}, ${session.role}, ${ipAddress}, ${userAgent})
    `;
  } catch (err) {
    console.error("issue temp pin audit insert failed:", err.message);
  }

  return Response.json({
    success: true,
    emp_id: targetEmpId,
    temp_pin: tempPin,
    expires_at: expiresAt.toISOString(),
  });
}
