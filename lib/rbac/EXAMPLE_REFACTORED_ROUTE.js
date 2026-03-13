/**
 * EXAMPLE: Refactored attendance/today Route Using Middleware
 * ============================================================
 *
 * This file demonstrates how to refactor the existing attendance/today route
 * to use the new createGuard middleware instead of inline permission checks.
 *
 * FILE: app/api/attendance/today/route.js (REFACTORED VERSION)
 */

import { createGuard } from "@/lib/rbac/apiGuard";
import {
  getEmployeeFromSessionEmpId,
  getTodayDateInBangkok,
  pickEmployeeName,
} from "@/lib/attendanceUtils";
import { supabaseServer } from "@/lib/supabaseServer";

/**
 * Helper function to build today's attendance history
 */
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

/**
 * Core handler logic - now ONLY contains business logic,
 * all authentication/authorization is handled by createGuard middleware
 *
 * NOTE: The 'req' parameter is passed by the middleware after validation
 */
async function attendanceTodayHandler(req) {
  // Extract session from request - it's guaranteed to exist because middleware validated it
  const { session } = req;

  const { employee, error: employeeError } = await getEmployeeFromSessionEmpId(
    session.emp_id
  );
  if (employeeError) {
    return Response.json(
      {
        error: "EMPLOYEE_QUERY_FAILED",
        detail: employeeError.message,
      },
      { status: 500 }
    );
  }

  if (!employee) {
    return Response.json(
      { error: "EMPLOYEE_NOT_FOUND" },
      { status: 400 }
    );
  }

  const today = getTodayDateInBangkok();

  const { data: attendance, error: attendanceError } = await supabaseServer
    .from("attendance")
    .select("*")
    .eq("employee_id", employee.id)
    .eq("date", today)
    .maybeSingle();

  if (attendanceError) {
    return Response.json(
      {
        error: "ATTENDANCE_QUERY_FAILED",
        detail: attendanceError.message,
      },
      { status: 500 }
    );
  }

  const { data: loginUser } = await supabaseServer
    .from("login_users")
    .select("line_user_id")
    .eq("emp_id", session.emp_id)
    .maybeSingle();

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

/**
 * Export the guarded handler
 *
 * The middleware (createGuard) will:
 * 1. Validate session from Authorization header
 * 2. Build access profile from session role
 * 3. Check for required permissions
 * 4. Log any denied attempts
 * 5. Call attendanceTodayHandler only if authorized
 *
 * COMPARISON:
 * - Before: 40+ lines with inline permission check (3 lines)
 * - After: 5 lines of export + handler function is cleaner
 * - Result: Handler is focused on business logic, middleware handles security
 */
export const GET = createGuard(attendanceTodayHandler, {
  requiredPermissions: [
    "attendance.read.self",
    "attendance.read.team",
    "attendance.read.department",
    "attendance.read.all",
  ],
  fallbackPermissions: ["rbac.manage"],
  route: "/api/attendance/today",
  method: "GET",
});

/**
 * BENEFITS OF THIS REFACTOR
 * ==========================
 *
 * 1. CLEANER CODE
 *    - Handler focuses only on business logic
 *    - No authentication/authorization boilerplate
 *    - Easier to read and understand intent
 *
 * 2. CONSISTENT ENFORCEMENT
 *    - Same pattern across all routes
 *    - Permissions defined in createGuard config, not hidden in handler
 *    - Less chance of copy-paste errors
 *
 * 3. AUDIT LOGGING
 *    - All permission denials automatically logged to console and Supabase
 *    - No extra code needed in handler
 *    - Centralized monitoring of access attempts
 *
 * 4. EASIER TESTING
 *    - Handler can be tested independently
 *    - Mock request object with session data
 *    - No need to test auth/permission logic per route
 *
 * 5. LESS DUPLICATED CODE
 *    - Before: Every route repeated 3-5 lines of permission checks
 *    - After: Centralized in createGuard, called once per route
 *
 * CAVEAT
 * ======
 * You need to modify createGuard to pass the session on the request object
 * or extract it in a way the handler can access it.
 * This is optional - the current approach works but requires minimal handler change.
 */
