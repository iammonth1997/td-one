import type { LoaderFunctionArgs } from "react-router";
import { validateSession } from "~/lib/session-validation.server";
import prisma from "~/lib/prisma.server";

const READ_ALL_ROLES = new Set(["admin", "super_admin", "hr_payroll", "hr-payroll", "hr payroll", "hrpayroll"]);

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers || {}),
    },
  });
}

function canReadAll(role: string | null | undefined) {
  const normalized = String(role || "").trim().toLowerCase();
  return READ_ALL_ROLES.has(normalized);
}

// Raw type for attendance_monthly rows (not in Prisma schema)
type AttendanceMonthlyRow = {
  id: string;
  emp_id: string;
  month: number;
  year: number;
  work_days: number | null;
  sl_days: number | null;
  sl_date: string | null;
  pl_days: number | null;
  pl_date: string | null;
  vl_days: number | null;
  vl_date: string | null;
  opl_days: number | null;
  opl_date: string | null;
  no_scan: number | null;
  noscan_date: string | null;
  rt_days: number | null;
  rt_date: string | null;
  off_days: number | null;
  off_date: string | null;
  night_shift_count: number | null;
  night_shift_dates: string | null;
  attendance_rate: number | null;
  total_leave: number | null;
  total_unpaid: number | null;
  total_paid_days: number | null;
};

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { session, error: authError, status: authStatus } = await validateSession(request, context);
  if (authError || !session) {
    return json({ error: authError || "UNAUTHORIZED" }, { status: authStatus || 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const empId = String(searchParams.get("emp_id") || "").trim().toUpperCase();
    const month = Number(searchParams.get("month"));
    const year = Number(searchParams.get("year"));

    if (!empId || !Number.isInteger(month) || !Number.isInteger(year)) {
      return json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    if (empId !== session.emp_id && !canReadAll(session.role)) {
      return json({ error: "FORBIDDEN" }, { status: 403 });
    }

    // attendance_monthly is not in the Prisma schema — use raw SQL
    let workRows: AttendanceMonthlyRow[];
    try {
      workRows = await prisma.$queryRaw<AttendanceMonthlyRow[]>`
        SELECT *
        FROM attendance_monthly
        WHERE emp_id = ${empId}
          AND month  = ${month}::int
          AND year   = ${year}::int
        LIMIT 1
      `;
    } catch (workError) {
      console.error("attendance_monthly query failed:", workError);
      return json({ error: "DAYWORK_NOT_FOUND", detail: String((workError as Error)?.message || workError) }, { status: 404 });
    }

    const work = workRows[0] ?? null;
    if (!work) {
      return json({ error: "DAYWORK_NOT_FOUND" }, { status: 404 });
    }

    // Fetch employee with related position, department and work_site via Prisma relations
    let emp;
    try {
      emp = await prisma.employee.findUnique({
        where: { employee_id: empId },
        select: {
          employee_id: true,
          first_name: true,
          last_name: true,
          position: true,
          department: { select: { name: true } },
          work_locations: { select: { name: true } },
        },
      });
    } catch (empError) {
      console.error("employees query failed:", empError);
    }

    const employee = emp
      ? {
          employee_code: emp.employee_id,
          first_name_th: emp.first_name,
          last_name_th: emp.last_name,
          position: emp.position ? { name: emp.position } : null,
          department: emp.department ? { name: emp.department.name } : null,
          work_site: emp.work_locations ? { name: emp.work_locations.name } : null,
        }
      : null;

    return json({ employee, daywork: work }, { status: 200 });
  } catch (error) {
    console.error("API_ERROR:", error);
    return json({ error: "SERVER_ERROR", detail: String((error as Error)?.message || error) }, { status: 500 });
  }
}
