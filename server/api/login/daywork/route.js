import { getPrisma } from "@/lib/prisma";
import { validateSession } from "@/lib/validateSession";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";

function toNumber(value) {
  return Number(value ?? 0);
}

function buildMonthContext(year, month) {
  const monthText = String(month).padStart(2, "0");
  return {
    monthKey: `${year}-${monthText}`,
    startOfMonthIso: `${year}-${monthText}-01`,
    endOfMonthIso: new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10),
  };
}

function buildDayworkPayload(empId, month, year, monthlySummary, attendanceAgg, leaveAgg, otAgg) {
  const workDays = monthlySummary?.work_days ?? toNumber(attendanceAgg?.present_days);
  const absentDays = monthlySummary?.absent_days ?? 0;
  const totalLeave = toNumber(leaveAgg?.total_leave);
  const totalPaidLeave = toNumber(leaveAgg?.total_paid_leave);
  const denominator = workDays + absentDays + totalLeave;
  const attendanceRate = denominator > 0
    ? Number(((workDays / denominator) * 100).toFixed(2))
    : null;

  return {
    id: monthlySummary?.id || `${empId}-${year}-${String(month).padStart(2, "0")}`,
    emp_id: empId,
    month,
    year,
    work_days: workDays,
    sl_days: toNumber(leaveAgg?.sl_days),
    sl_date: null,
    pl_days: toNumber(leaveAgg?.pl_days),
    pl_date: null,
    vl_days: toNumber(leaveAgg?.vl_days),
    vl_date: null,
    opl_days: toNumber(leaveAgg?.opl_days),
    opl_date: null,
    no_scan: toNumber(attendanceAgg?.no_scan),
    noscan_date: null,
    rt_days: toNumber(attendanceAgg?.rt_days),
    rt_date: null,
    off_days: toNumber(attendanceAgg?.off_days),
    off_date: null,
    night_shift_count: toNumber(attendanceAgg?.night_shift_count),
    night_shift_dates: null,
    attendance_rate: attendanceRate,
    total_leave: totalLeave,
    total_unpaid: toNumber(leaveAgg?.total_unpaid),
    total_paid_days: workDays + totalPaidLeave,
    total_hours: monthlySummary?.total_hours ?? toNumber(attendanceAgg?.total_hours),
    absent_days: absentDays,
    approved_ot_hours: toNumber(otAgg?.approved_ot_hours),
  };
}

export async function GET(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const accessProfile = buildSessionAccessProfile(session);

  try {
    const { searchParams } = new URL(req.url);
    const empId = String(searchParams.get("emp_id") || "").trim().toUpperCase();
    const month = Number(searchParams.get("month"));
    const year = Number(searchParams.get("year"));

    if (!empId || !Number.isInteger(month) || !Number.isInteger(year) || month < 1 || month > 12) {
      return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const canReadOwn = hasAnyPermission(accessProfile, ["daywork.read.self", "daywork.read.all", "rbac.manage"]);
    const canReadAll = hasAnyPermission(accessProfile, ["daywork.read.all", "rbac.manage"]);

    if (!canReadOwn) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    if (empId !== session.emp_id && !canReadAll) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    const { monthKey, startOfMonthIso, endOfMonthIso } = buildMonthContext(year, month);

    const employeeRows = await prisma.$queryRaw`
      SELECT
        e.employee_id AS employee_code,
        e.first_name,
        e.last_name,
        e.position AS position_name,
        d.name AS department_name,
        wl.name AS work_location_name,
        COALESCE(m.employee_uuid, mapped.employee_uuid) AS employee_uuid
      FROM employees e
      LEFT JOIN employee_uuid_mappings m
        ON m.employee_code = e.employee_id
      LEFT JOIN departments d
        ON d.id = e.department_id
      LEFT JOIN work_locations wl
        ON wl.id = e.work_location_id
      LEFT JOIN LATERAL (
        SELECT employee_uuid
        FROM (
          SELECT ps.employee_id AS employee_uuid
          FROM payroll_settings ps
          WHERE UPPER(ps.emp_code) = UPPER(e.employee_id)

          UNION ALL

          SELECT eps.employee_id AS employee_uuid
          FROM employee_payroll_settings eps
          WHERE UPPER(eps.emp_code) = UPPER(e.employee_id)

          UNION ALL

          SELECT al.employee_id AS employee_uuid
          FROM attendance_logs al
          WHERE UPPER(al.emp_code) = UPPER(e.employee_id)
            AND al.employee_id IS NOT NULL

          UNION ALL

          SELECT ass.employee_id AS employee_uuid
          FROM attendance_suspicious_scans ass
          WHERE UPPER(ass.employee_code) = UPPER(e.employee_id)
            AND ass.employee_id IS NOT NULL
        ) mapped_candidates
        WHERE employee_uuid IS NOT NULL
        LIMIT 1
      ) mapped ON true
      WHERE UPPER(e.employee_id) = ${empId}
      LIMIT 1
    `;

    const employeeRow = Array.isArray(employeeRows) ? employeeRows[0] : null;
    if (!employeeRow) {
      return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 404 });
    }

    const employee = {
      employee_code: employeeRow.employee_code,
      first_name_th: employeeRow.first_name,
      last_name_th: employeeRow.last_name,
      position: employeeRow.position_name ? { name: employeeRow.position_name } : null,
      department: employeeRow.department_name ? { name: employeeRow.department_name } : null,
      work_site: employeeRow.work_location_name ? { name: employeeRow.work_location_name } : null,
    };

    const emptyDaywork = buildDayworkPayload(empId, month, year, null, null, null, null);
    if (!employeeRow.employee_uuid) {
      return Response.json({ employee, daywork: emptyDaywork }, { status: 200 });
    }

    const [monthlySummaryRows, attendanceRows, leaveRows, otRows] = await Promise.all([
      prisma.$queryRaw`
        SELECT id, work_days, absent_days, total_hours
        FROM monthly_daywork_summary
        WHERE employee_id = ${employeeRow.employee_uuid}
          AND month = ${monthKey}
        LIMIT 1
      `,
      prisma.$queryRaw`
        SELECT
          COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) = 'present')::int AS present_days,
          COUNT(*) FILTER (WHERE (scan_in_time IS NULL) <> (scan_out_time IS NULL))::int AS no_scan,
          COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) IN ('rest', 'rest day'))::int AS rt_days,
          COUNT(*) FILTER (WHERE LOWER(COALESCE(status, '')) IN ('off', 'day off', 'day_off'))::int AS off_days,
          COUNT(*) FILTER (
            WHERE scan_in_time IS NOT NULL
              AND scan_out_time IS NOT NULL
              AND scan_out_time < scan_in_time
          )::int AS night_shift_count,
          COALESCE(SUM(total_hours), 0)::float8 AS total_hours
        FROM attendance
        WHERE employee_id = ${employeeRow.employee_uuid}
          AND work_date BETWEEN ${startOfMonthIso} AND ${endOfMonthIso}
      `,
      prisma.$queryRaw`
        SELECT
          COALESCE(SUM(CASE WHEN UPPER(lr.leave_type_code) = 'SL' THEN lr.total_days ELSE 0 END), 0)::float8 AS sl_days,
          COALESCE(SUM(CASE WHEN UPPER(lr.leave_type_code) = 'PL' THEN lr.total_days ELSE 0 END), 0)::float8 AS pl_days,
          COALESCE(SUM(CASE WHEN UPPER(lr.leave_type_code) = 'VL' THEN lr.total_days ELSE 0 END), 0)::float8 AS vl_days,
          COALESCE(SUM(CASE WHEN UPPER(lr.leave_type_code) = 'OPL' THEN lr.total_days ELSE 0 END), 0)::float8 AS opl_days,
          COALESCE(SUM(lr.total_days), 0)::float8 AS total_leave,
          COALESCE(SUM(CASE WHEN COALESCE(lt.is_paid, true) = false THEN lr.total_days ELSE 0 END), 0)::float8 AS total_unpaid,
          COALESCE(SUM(CASE WHEN COALESCE(lt.is_paid, true) = true THEN lr.total_days ELSE 0 END), 0)::float8 AS total_paid_leave
        FROM leave_requests lr
        LEFT JOIN leave_types lt
          ON lt.code = lr.leave_type_code
        WHERE lr.employee_id = ${employeeRow.employee_uuid}
          AND LOWER(COALESCE(lr.status, '')) = 'approved'
          AND lr.start_date >= ${startOfMonthIso}
          AND lr.end_date <= ${endOfMonthIso}
      `,
      prisma.$queryRaw`
        SELECT COALESCE(SUM(total_hours), 0)::float8 AS approved_ot_hours
        FROM ot_requests
        WHERE employee_id = ${employeeRow.employee_uuid}
          AND LOWER(COALESCE(status, '')) = 'approved'
          AND date BETWEEN ${startOfMonthIso} AND ${endOfMonthIso}
      `,
    ]);

    const daywork = buildDayworkPayload(
      empId,
      month,
      year,
      Array.isArray(monthlySummaryRows) ? monthlySummaryRows[0] : null,
      Array.isArray(attendanceRows) ? attendanceRows[0] : null,
      Array.isArray(leaveRows) ? leaveRows[0] : null,
      Array.isArray(otRows) ? otRows[0] : null,
    );

    return Response.json({ employee, daywork }, { status: 200 });
  } catch (err) {
    console.error("API_ERROR:", err);
    return Response.json({ error: "SERVER_ERROR", detail: err.message }, { status: 500 });
  }
}
