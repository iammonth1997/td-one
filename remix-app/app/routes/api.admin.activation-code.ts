/**
 * Employee Activation Code — Create (HR only)
 *
 * POST /api/admin/activation-code
 * Body: { emp_id: string }
 * Returns: { activation_code: string, expires_at: string }
 *
 * HR generates an 8-digit numeric activation code for a new employee.
 * Code is valid for 72 hours, single-use, invalidated after 5 failed attempts.
 * The plain code is returned ONCE to HR, then only the hash is stored.
 *
 * Required role: admin | super_admin | hr_manager | hr_payroll
 */

import type { ActionFunctionArgs } from "react-router";
import { validateSession } from "~/lib/session-validation.server";
import prisma from "~/lib/prisma.server";
import { writeAuditLog, AuditEvent } from "~/lib/audit-log.server";
import bcrypt from "bcryptjs";

const ADMIN_ROLES = new Set(["admin", "super_admin", "hr_manager", "hr_payroll", "hr-payroll"]);
const CODE_EXPIRY_HOURS = 72;
const CODE_LENGTH = 8;

// Blocked sequential/repetitive 8-digit patterns
const BLOCKED_CODES = new Set(["00000000", "11111111", "22222222", "33333333", "44444444",
  "55555555", "66666666", "77777777", "88888888", "99999999",
  "01234567", "12345678", "23456789", "87654321", "98765432"]);

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers || {}),
    },
  });
}

function generateActivationCode(): string {
  let code: string;
  do {
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const num = new DataView(bytes.buffer).getUint32(0) % 100_000_000;
    code = num.toString().padStart(CODE_LENGTH, "0");
  } while (BLOCKED_CODES.has(code));
  return code;
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { session, error: authError, status: authStatus } = await validateSession(request, context);
  if (authError || !session) {
    return json({ error: authError || "UNAUTHORIZED" }, { status: authStatus || 401 });
  }
  if (!ADMIN_ROLES.has(String(session.role).toLowerCase())) {
    return json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { emp_id?: string } | null;
  const targetEmpId = String(body?.emp_id || "").trim().toUpperCase();
  if (!targetEmpId) {
    return json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  // Verify employee exists
  const emp = await prisma.employee.findUnique({
    where: { employee_id: targetEmpId },
    select: { status: true },
  });

  if (!emp) {
    return json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 404 });
  }
  if (emp.status !== "active") {
    return json({ error: "ACCOUNT_BLOCKED" }, { status: 403 });
  }

  // Invalidate any previous unused codes for this employee
  // is_active = true means not yet invalidated; used_at = null means not yet used
  await prisma.employeeActivation.updateMany({
    where: { emp_id: targetEmpId, is_active: true, used_at: null },
    data: { is_active: false },
  });

  const plainCode = generateActivationCode();
  const codeHash = await bcrypt.hash(plainCode, 10);
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_HOURS * 60 * 60 * 1000);

  try {
    await prisma.employeeActivation.create({
      data: {
        emp_id: targetEmpId,
        code: codeHash,
        expires_at: expiresAt,
      },
    });
  } catch (insertErr) {
    console.error("activation code insert error:", insertErr);
    return json({ error: "DB_INSERT_FAILED" }, { status: 500 });
  }

  void writeAuditLog({
    event_type: AuditEvent.ACTIVATION_CODE_USED,
    emp_id: targetEmpId,
    ip_address: request.headers.get("x-forwarded-for") || null,
    metadata: { action: "code_created", created_by: session.emp_id, expires_at: expiresAt.toISOString() },
  });

  // Return plain code ONCE — HR must give it directly to the employee
  return json({
    activation_code: plainCode,
    expires_at: expiresAt.toISOString(),
    note: "Share this code directly with the employee. It expires in 72 hours and cannot be retrieved again.",
  });
}
