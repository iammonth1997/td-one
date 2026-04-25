import { getPrisma } from "@/lib/prisma";
import { getEmployeeByEmpCode } from "@/lib/otRequestUtils";
import { requireSalaryAccess } from "@/lib/requireSalaryAccess";

export async function GET(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { emp_id: salaryEmpId, error: salaryTokenError } = await requireSalaryAccess(prisma, req);
  if (salaryTokenError) {
    return Response.json({ error: salaryTokenError }, { status: 401 });
  }

  const empId = salaryEmpId;

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
