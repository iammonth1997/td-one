import type { ActionFunctionArgs } from "react-router";
import { clearFailedAttempts, checkRateLimit, recordLoginAttempt } from "~/lib/rate-limit.server";
import prisma from "~/lib/prisma.server";
import { validatePasswordPolicy, hashPassword } from "~/lib/password.server";
import { writeAuditLog, AuditEvent } from "~/lib/audit-log.server";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers || {}),
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const body = (await request.json().catch(() => null)) as {
    emp_id?: string;
    date_of_birth?: string;
    pin?: string;
    password?: string;
  } | null;
  const empId = String(body?.emp_id || "").trim().toUpperCase();
  const dob = String(body?.date_of_birth || "").trim();
  // Accept "password" (new) or "pin" (old) field
  const rawPassword = String(body?.password || body?.pin || "").trim();

  if (!empId || !dob || !rawPassword) {
    return json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  // Enforce NIST password policy
  const policyResult = validatePasswordPolicy(rawPassword, empId);
  if (!policyResult.valid) {
    return json({ error: policyResult.error || "INVALID_PASSWORD_FORMAT" }, { status: 400 });
  }

  const { locked, minutesRemaining } = await checkRateLimit(empId);
  if (locked) {
    return json({ error: "ACCOUNT_LOCKED", minutesRemaining }, { status: 429 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  let emp;
  try {
    emp = await prisma.employee.findUnique({
      where: { employee_id: empId },
      select: { date_of_birth: true, status: true },
    });
  } catch (dbError) {
    console.error("set-pin employees query failed:", dbError);
    return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  if (!emp) {
    return json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });
  }

  if (emp.status !== "active") {
    return json({ error: "ACCOUNT_BLOCKED", reason: emp.status }, { status: 403 });
  }

  // First-time onboarding only:
  // - If the employee already has a registered credential, block this endpoint.
  // - Users who are forced to change due to migration should use /change-password.
  let existingLoginUser;
  try {
    existingLoginUser = await prisma.loginUser.findFirst({
      where: { emp_id: empId },
      select: { pin_hash: true },
    });
  } catch (dbError) {
    console.error("set-pin login_users query failed:", dbError);
    return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  const alreadyHasCredential = Boolean(existingLoginUser?.pin_hash);
  if (alreadyHasCredential) {
    return json({ error: "ACCOUNT_ALREADY_REGISTERED" }, { status: 409 });
  }

  // Compare date_of_birth: Prisma returns a Date object, normalise to YYYY-MM-DD
  const employeeDob = emp.date_of_birth
    ? emp.date_of_birth.toISOString().slice(0, 10)
    : "";
  if (employeeDob !== dob) {
    await recordLoginAttempt(empId, false, ip);
    return json({ error: "INVALID_DOB" }, { status: 400 });
  }

  const pinHash = await hashPassword(rawPassword);

  try {
    await prisma.loginUser.upsert({
      where: { emp_id: empId },
      update: {
        pin_hash: pinHash,
        force_pin_change: false,
        must_change_password: false,
        temp_pin_expires_at: null,
      },
      create: {
        emp_id: empId,
        pin_hash: pinHash,
        force_pin_change: false,
        must_change_password: false,
        temp_pin_expires_at: null,
      },
    });
  } catch (dbError) {
    console.error("set-pin login_users upsert failed:", dbError);
    return json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  await clearFailedAttempts(empId);

  void writeAuditLog({
    event_type: AuditEvent.PASSWORD_CHANGED,
    emp_id: empId,
    ip_address: ip,
    metadata: { action: "initial_password_set" },
  });

  return json({ success: true }, { status: 200 });
}
