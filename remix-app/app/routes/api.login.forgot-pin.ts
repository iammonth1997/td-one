import type { ActionFunctionArgs } from "react-router";
import { clearFailedAttempts, checkRateLimit, recordLoginAttempt } from "~/lib/rate-limit.server";
import { generateResetToken } from "~/lib/reset-token.server";
import { canManagePinReset } from "~/lib/role-access.server";
import { validateSession } from "~/lib/session-validation.server";
import prisma from "~/lib/prisma.server";
import { isEmployeeAccountActive } from "~/lib/employee-auth.server";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers || {}),
    },
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { session, error: authError, status: authStatus } = await validateSession(request, context);
  if (authError || !session) {
    return json({ error: authError || "UNAUTHORIZED" }, { status: authStatus || 401 });
  }

  if (!canManagePinReset(session.role)) {
    return json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    emp_id?: string;
    start_month?: number;
    start_year?: number;
    date_of_birth?: string;
  } | null;

  const empId = String(body?.emp_id || "").trim().toUpperCase();
  const startMonth = Number(body?.start_month);
  const startYear = Number(body?.start_year);
  const dob = String(body?.date_of_birth || "").trim();

  if (!empId || !startMonth || !startYear || !dob) {
    return json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  if (startMonth < 1 || startMonth > 12) {
    return json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const { locked, minutesRemaining } = await checkRateLimit(empId);
  if (locked) {
    return json({ error: "ACCOUNT_LOCKED", minutesRemaining }, { status: 429 });
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  // Use raw query to access start_date which is not in the Prisma Employee model
  type EmpRow = { date_of_birth: Date | null; start_date: Date | null; status: string };
  let empRows: EmpRow[];
  try {
    empRows = await prisma.$queryRaw<EmpRow[]>`
      SELECT date_of_birth, start_date, status
      FROM employees
      WHERE employee_id = ${empId}
      LIMIT 1
    `;
  } catch (dbError) {
    console.error("forgot-pin employees query failed:", dbError);
    return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  const emp = empRows[0] ?? null;

  if (!emp) {
    return json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });
  }

  if (!isEmployeeAccountActive(emp.status)) {
    return json({ error: "ACCOUNT_BLOCKED", reason: emp.status }, { status: 403 });
  }

  // Compare date_of_birth: normalise to YYYY-MM-DD
  const employeeDob = emp.date_of_birth
    ? new Date(emp.date_of_birth).toISOString().slice(0, 10)
    : "";
  if (employeeDob !== dob) {
    await recordLoginAttempt(empId, false, ip);
    return json({ error: "INVALID_DOB" }, { status: 400 });
  }

  const empStartDate = emp.start_date ? new Date(emp.start_date) : null;
  if (!empStartDate) {
    return json({ error: "START_DATE_NOT_FOUND" }, { status: 400 });
  }

  const empStartMonth = empStartDate.getMonth() + 1;
  const empStartYear = empStartDate.getFullYear();

  if (empStartMonth !== startMonth || empStartYear !== startYear) {
    await recordLoginAttempt(empId, false, ip);
    return json({ error: "INVALID_START_DATE" }, { status: 400 });
  }

  const user = await prisma.loginUser.findFirst({
    where: { emp_id: empId },
    select: { emp_id: true },
  });

  if (!user) {
    return json({ error: "USER_NOT_REGISTERED" }, { status: 400 });
  }

  let token: string;
  try {
    token = await generateResetToken(context, empId, session.emp_id);
  } catch (error) {
    console.error("forgot-password reset token generation failed:", error);
    return json(
      { error: "SERVER_CONFIG_MISSING", message: "RESET_PIN_SECRET is required" },
      { status: 500 }
    );
  }

  await clearFailedAttempts(empId);
  return json({ success: true, token }, { status: 200 });
}
