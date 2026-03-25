import { validateSession } from "@/lib/validateSession";
import prisma from "@/lib/prisma";
import { getEmployeeByEmpCode } from "@/lib/otRequestUtils";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";

async function hashToken(token) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

async function validateSalaryToken(req) {
  const authHeader = req.headers.get("x-salary-token");
  if (!authHeader) {
    return { emp_id: null, error: null };
  }

  const rawToken = authHeader.startsWith("SalaryToken ") ? authHeader.slice(12).trim() : authHeader;
  if (!rawToken) {
    return { emp_id: null, error: "INVALID_SALARY_TOKEN_FORMAT" };
  }

  const tokenHash = await hashToken(rawToken);

  let data;
  try {
    data = await prisma.salarySession.findUnique({
      where: { token_hash: tokenHash },
      select: { emp_id: true, expires_at: true },
    });
  } catch (dbErr) {
    console.error("validateSalaryToken DB error:", dbErr);
    return { emp_id: null, error: "SESSION_VALIDATION_FAILED" };
  }

  if (!data) {
    return { emp_id: null, error: "INVALID_SALARY_TOKEN" };
  }

  if (new Date(data.expires_at) < new Date()) {
    await prisma.salarySession.deleteMany({ where: { token_hash: tokenHash } });
    return { emp_id: null, error: "SALARY_TOKEN_EXPIRED" };
  }

  return { emp_id: data.emp_id, error: null };
}

export async function GET(req) {
  const { emp_id: salaryEmpId, error: salaryTokenError } = await validateSalaryToken(req);
  if (salaryTokenError) {
    return Response.json({ error: salaryTokenError }, { status: 401 });
  }

  let empId = salaryEmpId;

  if (!empId) {
    const { session, error: authError, status: authStatus } = await validateSession(req);
    if (authError) return Response.json({ error: authError }, { status: authStatus });

    const accessProfile = buildSessionAccessProfile(session);
    if (!hasAnyPermission(accessProfile, ["payroll.read.self", "payroll.read.full", "payroll.read.summary", "rbac.manage"])) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    empId = session.emp_id;
  }

  const { employee, error: employeeError } = await getEmployeeByEmpCode(empId);
  if (employeeError) return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
  if (!employee) return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") || new Date().getFullYear());
  const month = Number(searchParams.get("month") || new Date().getMonth() + 1);

  try {
    const slip = await prisma.salarySlip.findFirst({
      where: { employee_id: employee.id, year, month },
    });

    return Response.json(
      {
        success: true,
        slip: slip || null,
        employee: {
          id: employee.id,
          name: employee.name,
          employee_code: employee.employee_code,
        },
        period: { year, month },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          "Pragma": "no-cache",
          "Expires": "0",
        },
      }
    );
  } catch (err) {
    return Response.json({ error: "SALARY_SLIP_QUERY_FAILED", detail: err.message }, { status: 500 });
  }
}
