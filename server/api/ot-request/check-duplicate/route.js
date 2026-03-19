import { validateSession } from "@/lib/validateSession";
import { findExistingOtOnDate, getEmployeeByEmpCode, hasLeaveOnDate } from "@/lib/otRequestUtils";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const accessProfile = buildSessionAccessProfile(session);
  if (!hasAnyPermission(accessProfile, ["ot.request.self", "ot.read.self", "ot.read.team", "ot.read.department", "ot.read.all", "rbac.manage"])) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const date = String(searchParams.get("date") || "").trim();
  if (!date) {
    return Response.json({ error: "INVALID_DATE" }, { status: 400 });
  }

  const { employee, error: employeeError } = await getEmployeeByEmpCode(session.emp_id);
  if (employeeError) {
    return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
  }
  if (!employee) {
    return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });
  }

  const duplicateCheck = await findExistingOtOnDate(employee.id, date);
  if (duplicateCheck.error) {
    return Response.json({ error: "OT_DUPLICATE_CHECK_FAILED", detail: duplicateCheck.error.message }, { status: 500 });
  }

  const leaveCheck = await hasLeaveOnDate(employee.id, date);
  if (leaveCheck.error) {
    return Response.json({ error: "LEAVE_CHECK_FAILED", detail: leaveCheck.error.message }, { status: 500 });
  }

  return Response.json({
    success: true,
    has_ot: duplicateCheck.rows.length > 0,
    has_leave: Boolean(leaveCheck.conflict),
    rows: duplicateCheck.rows,
  });
}
