import { withPgClient } from "~/lib/pg.server";

export type LatestSlipSummary = {
  id: string;
  year: number;
  month: number;
};

export type EmployeeDashboardSnapshot = {
  employeeCode: string;
  employeeUuid: string | null;
  firstName: string;
  lastName: string;
  todayCheckInTime: string | null;
  workedDaysThisMonth: number;
  nightShiftDaysThisMonth: number;
  leaveUsedThisMonth: number;
  leaveRemaining: number;
  otHoursThisMonth: number;
  otHoursTotal: number;
  latestSlip: LatestSlipSummary | null;
};

type EmployeeIdentityRow = {
  employee_code: string;
  first_name: string | null;
  last_name: string | null;
  employee_uuid: string | null;
};

type SingleNumberRow = {
  value: number | null;
};

type MonthlyWorkDaysRow = {
  work_days: number | null;
};

type LeaveBalanceRow = {
  total_days: number | null;
  used_days: number | null;
};

type CheckInRow = {
  check_in_time: string | null;
};

function buildEmptySnapshot(employeeCode: string): EmployeeDashboardSnapshot {
  return {
    employeeCode,
    employeeUuid: null,
    firstName: "",
    lastName: "",
    todayCheckInTime: null,
    workedDaysThisMonth: 0,
    nightShiftDaysThisMonth: 0,
    leaveUsedThisMonth: 0,
    leaveRemaining: 0,
    otHoursThisMonth: 0,
    otHoursTotal: 0,
    latestSlip: null,
  };
}

function getBangkokDateParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  const parts = formatter.formatToParts(now);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(lookup.year);
  const month = Number(lookup.month);
  const day = Number(lookup.day);
  const todayIso = `${lookup.year}-${lookup.month}-${lookup.day}`;
  const monthKey = `${lookup.year}-${lookup.month}`;
  const startOfMonthIso = `${lookup.year}-${lookup.month}-01`;
  const endOfMonthIso = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);

  return { year, month, day, todayIso, monthKey, startOfMonthIso, endOfMonthIso };
}

function toNumber(value: number | null | undefined) {
  return Number(value ?? 0);
}

export async function loadEmployeeDashboardSnapshot(
  connectionString: string | null,
  employeeCode: string,
): Promise<EmployeeDashboardSnapshot> {
  const fallback = buildEmptySnapshot(employeeCode);
  if (!connectionString) {
    return fallback;
  }

  const { year, todayIso, monthKey, startOfMonthIso, endOfMonthIso } = getBangkokDateParts();

  try {
    return await withPgClient(
      connectionString,
      async (client) => {
        const employeeResult = await client.query<EmployeeIdentityRow>(
          `SELECT
             e.employee_id AS employee_code,
             e.first_name,
             e.last_name,
             COALESCE(m.employee_uuid, mapped.employee_uuid) AS employee_uuid
           FROM employees e
           LEFT JOIN employee_uuid_mappings m
             ON m.employee_code = e.employee_id
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
           WHERE UPPER(e.employee_id) = UPPER($1)
           LIMIT 1`,
          [employeeCode],
        );

        const employee = employeeResult.rows[0];
        if (!employee) {
          return fallback;
        }

        const snapshot: EmployeeDashboardSnapshot = {
          ...fallback,
          employeeCode: employee.employee_code,
          employeeUuid: employee.employee_uuid,
          firstName: employee.first_name || "",
          lastName: employee.last_name || "",
        };

        if (!employee.employee_uuid) {
          return snapshot;
        }

        const todayAttendanceResult = await client.query<CheckInRow>(
          `SELECT to_char(scan_in_time, 'HH24:MI') AS check_in_time
           FROM attendance
           WHERE employee_id = $1
             AND work_date = $2
           ORDER BY scan_in_time ASC NULLS LAST
           LIMIT 1`,
          [employee.employee_uuid, todayIso],
        );

        const monthlyWorkSummaryResult = await client.query<MonthlyWorkDaysRow>(
          `SELECT work_days
           FROM monthly_daywork_summary
           WHERE employee_id = $1
             AND month = $2
           LIMIT 1`,
          [employee.employee_uuid, monthKey],
        );

        const attendanceCountResult = await client.query<SingleNumberRow>(
          `SELECT COUNT(*)::int AS value
           FROM attendance
           WHERE employee_id = $1
             AND work_date BETWEEN $2 AND $3
             AND LOWER(COALESCE(status, '')) = 'present'`,
          [employee.employee_uuid, startOfMonthIso, endOfMonthIso],
        );

        const nightShiftCountResult = await client.query<SingleNumberRow>(
          `SELECT COUNT(*)::int AS value
           FROM attendance
           WHERE employee_id = $1
             AND work_date BETWEEN $2 AND $3
             AND scan_in_time IS NOT NULL
             AND scan_out_time IS NOT NULL
             AND scan_out_time < scan_in_time`,
          [employee.employee_uuid, startOfMonthIso, endOfMonthIso],
        );

        const leaveUsedResult = await client.query<SingleNumberRow>(
          `SELECT COALESCE(SUM(total_days), 0)::float8 AS value
           FROM leave_requests
           WHERE employee_id = $1
             AND LOWER(COALESCE(status, '')) = 'approved'
             AND start_date >= $2
             AND end_date <= $3`,
          [employee.employee_uuid, startOfMonthIso, endOfMonthIso],
        );

        const leaveBalanceResult = await client.query<LeaveBalanceRow>(
          `SELECT
             COALESCE(SUM(total_days), 0)::float8 AS total_days,
             COALESCE(SUM(used_days), 0)::float8 AS used_days
           FROM leave_balances
           WHERE employee_id = $1
             AND year = $2`,
          [employee.employee_uuid, year],
        );

        const otMonthResult = await client.query<SingleNumberRow>(
          `SELECT COALESCE(SUM(total_hours), 0)::float8 AS value
           FROM ot_requests
           WHERE employee_id = $1
             AND LOWER(COALESCE(status, '')) = 'approved'
             AND date BETWEEN $2 AND $3`,
          [employee.employee_uuid, startOfMonthIso, endOfMonthIso],
        );

        const otTotalResult = await client.query<SingleNumberRow>(
          `SELECT COALESCE(SUM(total_hours), 0)::float8 AS value
           FROM ot_requests
           WHERE employee_id = $1
             AND LOWER(COALESCE(status, '')) = 'approved'`,
          [employee.employee_uuid],
        );

        const latestSlipResult = await client.query<LatestSlipSummary>(
          `SELECT id, year, month
           FROM salary_slips
           WHERE employee_id = $1
           ORDER BY year DESC, month DESC
           LIMIT 1`,
          [employee.employee_uuid],
        );

        const leaveBalance = leaveBalanceResult.rows[0];
        const monthlyWorkDays = monthlyWorkSummaryResult.rows[0]?.work_days;
        const workedDaysThisMonth =
          monthlyWorkDays !== null && monthlyWorkDays !== undefined
            ? toNumber(monthlyWorkDays)
            : toNumber(attendanceCountResult.rows[0]?.value);

        return {
          ...snapshot,
          todayCheckInTime: todayAttendanceResult.rows[0]?.check_in_time || null,
          workedDaysThisMonth,
          nightShiftDaysThisMonth: toNumber(nightShiftCountResult.rows[0]?.value),
          leaveUsedThisMonth: toNumber(leaveUsedResult.rows[0]?.value),
          leaveRemaining: Math.max(toNumber(leaveBalance?.total_days) - toNumber(leaveBalance?.used_days), 0),
          otHoursThisMonth: toNumber(otMonthResult.rows[0]?.value),
          otHoursTotal: toNumber(otTotalResult.rows[0]?.value),
          latestSlip: latestSlipResult.rows[0] || null,
        };
      },
      1,
    );
  } catch (error) {
    console.error("loadEmployeeDashboardSnapshot failed:", error);
    return fallback;
  }
}
