import { getPrisma } from "@/lib/prisma";
import { validateSession } from "@/lib/validateSession";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";

export async function GET(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  // Session validation
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const accessProfile = buildSessionAccessProfile(session);

  try {
    const { searchParams } = new URL(req.url);

    const emp_id = searchParams.get("emp_id");
    const month = searchParams.get("month");
    const year = searchParams.get("year");

    if (!emp_id || !month || !year) {
      return Response.json({ error: "Missing parameters" }, { status: 400 });
    }

    // Enforce: employees can only query their own data
    const canReadOwn = hasAnyPermission(accessProfile, ["daywork.read.self", "daywork.read.all", "rbac.manage"]);
    const canReadAll = hasAnyPermission(accessProfile, ["daywork.read.all", "rbac.manage"]);

    if (!canReadOwn) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    if (emp_id !== session.emp_id && !canReadAll) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    // attendance_monthly is not in the Prisma schema; use raw SQL
    const monthNum = Number(month);
    const yearNum = Number(year);
    let workRows;
    try {
      workRows = await prisma.$queryRaw`
        SELECT *
        FROM attendance_monthly
        WHERE emp_id = ${emp_id}
          AND month = ${monthNum}
          AND year  = ${yearNum}
        LIMIT 1
      `;
    } catch (err) {
      return Response.json(
        { error: "DAYWORK_NOT_FOUND", detail: err.message },
        { status: 404 }
      );
    }

    const work = workRows[0] || null;
    if (!work) {
      return Response.json(
        { error: "DAYWORK_NOT_FOUND", detail: "No record found" },
        { status: 404 }
      );
    }

    // Query employee with position, department, and work-site relations in a
    // single Prisma query. The Prisma schema uses first_name / last_name;
    // these are mapped to first_name_th / last_name_th in the response to
    // preserve the existing API shape.
    let emp = null;
    try {
      emp = await prisma.employee.findFirst({
        where: { employee_code: emp_id },
        select: {
          employee_code: true,
          first_name: true,
          last_name: true,
          position: { select: { name: true } },
          department: { select: { name: true } },
          workSite: { select: { name: true } },
        },
      });
    } catch (empErr) {
      console.error("employees query failed:", empErr.message);
    }

    const employee = emp
      ? {
          employee_code: emp.employee_code,
          first_name_th: emp.first_name,
          last_name_th: emp.last_name,
          position: emp.position ? { name: emp.position.name } : null,
          department: emp.department ? { name: emp.department.name } : null,
          work_site: emp.workSite ? { name: emp.workSite.name } : null,
        }
      : null;

    return Response.json({ employee, daywork: work }, { status: 200 });
  } catch (err) {
    console.error("API_ERROR:", err);
    return Response.json({ error: "SERVER_ERROR", detail: err.message }, { status: 500 });
  }
}
