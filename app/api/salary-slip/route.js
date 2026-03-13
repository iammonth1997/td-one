import { validateSession } from "@/lib/validateSession";
import { supabaseServer } from "@/lib/supabaseServer";
import { getEmployeeByEmpCode } from "@/lib/otRequestUtils";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const accessProfile = buildSessionAccessProfile(session);
  if (!hasAnyPermission(accessProfile, ["payroll.read.self", "payroll.read.full", "payroll.read.summary", "rbac.manage"])) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { employee, error: employeeError } = await getEmployeeByEmpCode(session.emp_id);
  if (employeeError) return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
  if (!employee) return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") || new Date().getFullYear());
  const month = Number(searchParams.get("month") || new Date().getMonth() + 1);

  const { data: slip, error } = await supabaseServer
    .from("salary_slips")
    .select("*")
    .eq("employee_id", employee.id)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (error) {
    return Response.json({ error: "SALARY_SLIP_QUERY_FAILED", detail: error.message }, { status: 500 });
  }

  return Response.json({
    success: true,
    slip: slip || null,
    employee: {
      id: employee.id,
      name: employee.name,
      employee_code: employee.employee_code,
    },
    period: { year, month },
  });
}
