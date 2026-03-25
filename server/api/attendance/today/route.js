import { validateSession } from "@/lib/validateSession";
import { getEmployeeFromSessionEmpId, getTodayDateInBangkok, pickEmployeeName } from "@/lib/attendanceUtils";
import prisma from "@/lib/prisma";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";
import { EMPLOYEE_PORTAL, isPortalContextAllowed } from "@/lib/sessionContext";

function buildTodayHistory(row) {
  if (!row) return [];

  const events = [];
  if (row.scan_in_time) {
    events.push({
      type: "scan_in",
      time: row.scan_in_time,
      latitude: row.scan_in_latitude,
      longitude: row.scan_in_longitude,
      location_id: row.scan_in_location_id,
    });
  }
  if (row.scan_out_time) {
    events.push({
      type: "scan_out",
      time: row.scan_out_time,
      latitude: row.scan_out_latitude,
      longitude: row.scan_out_longitude,
      location_id: row.scan_out_location_id,
    });
  }

  return events;
}

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  if (!isPortalContextAllowed(session, [EMPLOYEE_PORTAL])) {
    return Response.json({ error: "FORBIDDEN_PORTAL_CONTEXT" }, { status: 403 });
  }

  const accessProfile = buildSessionAccessProfile(session);
  if (!hasAnyPermission(accessProfile, ["attendance.read.self", "attendance.read.team", "attendance.read.department", "attendance.read.all"])) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { employee, error: employeeError } = await getEmployeeFromSessionEmpId(session.emp_id);
  if (employeeError) {
    return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
  }

  if (!employee) {
    return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });
  }

  const today = getTodayDateInBangkok();

  let attendance = null;
  try {
    attendance = await prisma.attendance.findFirst({
      where: { employee_id: employee.id, work_date: today },
    });
  } catch (err) {
    return Response.json({ error: "ATTENDANCE_QUERY_FAILED", detail: err.message }, { status: 500 });
  }

  let loginUser = null;
  try {
    loginUser = await prisma.loginUser.findFirst({
      where: { emp_id: session.emp_id },
      select: { line_user_id: true },
    });
  } catch {
    // non-critical — continue without line_user_id
  }

  let suggestedAction = "scan_in";
  if (attendance?.scan_in_time && !attendance?.scan_out_time) {
    suggestedAction = "scan_out";
  } else if (attendance?.scan_in_time && attendance?.scan_out_time) {
    suggestedAction = "completed";
  }

  return Response.json({
    success: true,
    today,
    suggested_action: suggestedAction,
    employee: {
      id: employee.id,
      employee_code: employee.employee_code,
      name: pickEmployeeName(employee),
      department: employee.department || employee.dept || null,
      position: employee.position || employee.job_title || null,
      line_user_id: loginUser?.line_user_id || null,
      status: employee.status || null,
    },
    attendance: attendance || null,
    history: buildTodayHistory(attendance),
  });
}
