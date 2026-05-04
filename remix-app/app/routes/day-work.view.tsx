import { Link, redirect } from "react-router";
import type { Route } from "./+types/day-work.view";
import { loadEmployeeDashboardSnapshot } from "~/lib/employee-dashboard.server";
import { getConnectionString, withPgClient } from "~/lib/pg.server";
import { validateSession } from "~/lib/session-validation.server";

type EmployeeProfile = {
  employeeCode: string;
  firstName: string | null;
  lastName: string | null;
  positionName: string | null;
  departmentName: string | null;
  workSiteName: string | null;
  employeeUuid: string | null;
};

type DayWorkSummary = {
  workDays: number;
  absentDays: number;
  totalHours: number;
  approvedLeaveDays: number;
  approvedOtHours: number;
  nightShiftDays: number;
};

type EmployeeProfileRow = {
  employee_code: string;
  first_name: string | null;
  last_name: string | null;
  position_name: string | null;
  department_name: string | null;
  work_location_name: string | null;
};

type MonthlySummaryRow = {
  work_days: number | null;
  absent_days: number | null;
  total_hours: number | null;
};

type NumberRow = {
  value: number | null;
};

const EMPTY_SUMMARY: DayWorkSummary = {
  workDays: 0,
  absentDays: 0,
  totalHours: 0,
  approvedLeaveDays: 0,
  approvedOtHours: 0,
  nightShiftDays: 0,
};

function getBangkokMonthContext(now = new Date()) {
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
  const startOfMonthIso = `${lookup.year}-${lookup.month}-01`;
  const endOfMonthIso = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const monthKey = `${lookup.year}-${lookup.month}`;

  return { year, month, startOfMonthIso, endOfMonthIso, monthKey };
}

function formatMetricValue(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function parseYearMonthParam(value: string | null, fallback: number) {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
}

function DayCard({
  title,
  value,
  tone,
  suffix,
}: {
  title: string;
  value: number;
  tone: string;
  suffix?: string;
}) {
  return (
    <div className="rounded-[1rem] border border-[#FECACA] bg-white p-4 text-center shadow-[0_4px_16px_rgba(220,38,38,0.08)]">
      <div className={`text-2xl font-bold ${tone}`}>
        {formatMetricValue(value)}
        {suffix ? <span className="ml-1 text-sm font-semibold">{suffix}</span> : null}
      </div>
      <div className="mt-1 text-xs text-[#555555]">{title}</div>
    </div>
  );
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { session, error } = await validateSession(request, context);
  if (error || !session) {
    throw redirect("/login");
  }

  const url = new URL(request.url);
  const bangkokNow = getBangkokMonthContext();
  const year = parseYearMonthParam(url.searchParams.get("year"), bangkokNow.year);
  const month = parseYearMonthParam(url.searchParams.get("month"), bangkokNow.month);

  if (month < 1 || month > 12 || year < 2000 || year > 2100) {
    return { error: "Invalid year/month parameter.", year: null, month: null, employee: null, summary: EMPTY_SUMMARY };
  }

  const startOfMonthIso = `${year}-${String(month).padStart(2, "0")}-01`;
  const endOfMonthIso = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const monthKey = `${year}-${String(month).padStart(2, "0")}`;
  const connectionString = getConnectionString(context);
  const dashboardSnapshot = await loadEmployeeDashboardSnapshot(connectionString, session.emp_id);

  const employee: EmployeeProfile = {
    employeeCode: dashboardSnapshot.employeeCode || session.emp_id,
    firstName: dashboardSnapshot.firstName || null,
    lastName: dashboardSnapshot.lastName || null,
    positionName: null,
    departmentName: null,
    workSiteName: null,
    employeeUuid: dashboardSnapshot.employeeUuid,
  };

  const summary: DayWorkSummary = { ...EMPTY_SUMMARY };

  if (connectionString) {
    try {
      await withPgClient(
        connectionString,
        async (client) => {
          const employeeResult = await client.query<EmployeeProfileRow>(
            `SELECT
               e.employee_id AS employee_code,
               e.first_name,
               e.last_name,
               e.position AS position_name,
               d.name AS department_name,
               wl.name AS work_location_name
             FROM employees e
             LEFT JOIN departments d
               ON d.id = e.department_id
             LEFT JOIN work_locations wl
               ON wl.id = e.work_location_id
             WHERE UPPER(e.employee_id) = UPPER($1)
             LIMIT 1`,
            [session.emp_id],
          );

          const profile = employeeResult.rows[0];
          if (profile) {
            employee.employeeCode = profile.employee_code;
            employee.firstName = employee.firstName || profile.first_name;
            employee.lastName = employee.lastName || profile.last_name;
            employee.positionName = profile.position_name;
            employee.departmentName = profile.department_name;
            employee.workSiteName = profile.work_location_name;
          }

          if (!employee.employeeUuid) {
            return;
          }

          const monthlySummaryResult = await client.query<MonthlySummaryRow>(
            `SELECT work_days, absent_days, total_hours
             FROM monthly_daywork_summary
             WHERE employee_id = $1
               AND month = $2
             LIMIT 1`,
            [employee.employeeUuid, monthKey],
          );

          const attendanceCountResult = await client.query<NumberRow>(
            `SELECT COUNT(*)::int AS value
             FROM attendance
             WHERE employee_id = $1
               AND work_date BETWEEN $2 AND $3
               AND LOWER(COALESCE(status, '')) = 'present'`,
            [employee.employeeUuid, startOfMonthIso, endOfMonthIso],
          );

          const leaveDaysResult = await client.query<NumberRow>(
            `SELECT COALESCE(SUM(total_days), 0)::float8 AS value
             FROM leave_requests
             WHERE employee_id = $1
               AND LOWER(COALESCE(status, '')) = 'approved'
               AND start_date >= $2
               AND end_date <= $3`,
            [employee.employeeUuid, startOfMonthIso, endOfMonthIso],
          );

          const otHoursResult = await client.query<NumberRow>(
            `SELECT COALESCE(SUM(total_hours), 0)::float8 AS value
             FROM ot_requests
             WHERE employee_id = $1
               AND LOWER(COALESCE(status, '')) = 'approved'
               AND date BETWEEN $2 AND $3`,
            [employee.employeeUuid, startOfMonthIso, endOfMonthIso],
          );

          const nightShiftResult = await client.query<NumberRow>(
            `SELECT COUNT(*)::int AS value
             FROM attendance
             WHERE employee_id = $1
               AND work_date BETWEEN $2 AND $3
               AND scan_in_time IS NOT NULL
               AND scan_out_time IS NOT NULL
               AND scan_out_time < scan_in_time`,
            [employee.employeeUuid, startOfMonthIso, endOfMonthIso],
          );

          const monthlySummary = monthlySummaryResult.rows[0];
          summary.workDays =
            monthlySummary?.work_days ?? attendanceCountResult.rows[0]?.value ?? 0;
          summary.absentDays = monthlySummary?.absent_days ?? 0;
          summary.totalHours = monthlySummary?.total_hours ?? 0;
          summary.approvedLeaveDays = leaveDaysResult.rows[0]?.value ?? 0;
          summary.approvedOtHours = otHoursResult.rows[0]?.value ?? 0;
          summary.nightShiftDays = nightShiftResult.rows[0]?.value ?? 0;
        },
        1,
      );
    } catch (dbError) {
      console.error("day-work.view loader DB error:", dbError);
    }
  }

  return {
    error: null,
    year,
    month,
    employee,
    summary,
  };
}

export default function DayWorkViewPage({ loaderData }: Route.ComponentProps) {
  if (loaderData.error) {
    return (
      <main className="min-h-screen bg-white px-4 py-6 sm:px-6 sm:py-10">
        <section className="mx-auto w-full max-w-xl rounded-[1rem] border border-[#FECACA] bg-white p-6 shadow-[0_4px_24px_rgba(220,38,38,0.15)]">
          <h2 className="text-xl font-bold text-[#DC2626]">Error</h2>
          <p className="mt-2 text-[#555555]">{loaderData.error}</p>
          <div className="mt-6 flex items-center justify-between">
            <Link
              to="/dashboard"
              className="inline-block rounded-xl border border-[#DC2626] bg-white px-4 py-2 font-semibold text-[#DC2626] transition hover:bg-[#FEF2F2]"
            >
              Back
            </Link>
            <Link
              to="/dashboard"
              className="inline-block rounded-xl border border-[#DC2626] bg-white px-4 py-2 font-semibold text-[#DC2626] transition hover:bg-[#FEF2F2]"
            >
              Home
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto w-full max-w-4xl rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_4px_24px_rgba(220,38,38,0.15)] sm:p-7">
        <div className="mb-6 rounded-[1rem] border border-[#FECACA] bg-[#FEF2F2] p-4">
          <h2 className="text-lg font-bold text-[#DC2626]">Employee Information</h2>
          <div className="mt-2 space-y-1 text-sm text-[#444444]">
            <p>
              Employee ID: <span className="font-semibold">{loaderData.employee?.employeeCode || "-"}</span>
            </p>
            <p>
              Name: <span className="font-semibold">{loaderData.employee?.firstName || "-"} {loaderData.employee?.lastName || ""}</span>
            </p>
            <p>Position: {loaderData.employee?.positionName || "-"}</p>
            <p>Department: {loaderData.employee?.departmentName || "-"}</p>
            <p>Work location: {loaderData.employee?.workSiteName || "-"}</p>
          </div>
        </div>

        <h2 className="text-2xl font-bold text-[#DC2626] sm:text-3xl">Day Work Result</h2>
        <div className="mb-4 mt-4 space-y-1 text-sm text-[#555555]">
          <p>
            Year: <span className="font-semibold text-[#111111]">{loaderData.year}</span>
          </p>
          <p>
            Month: <span className="font-semibold text-[#111111]">{loaderData.month}</span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <DayCard title="Work days" value={loaderData.summary.workDays} tone="text-[#DC2626]" suffix="days" />
          <DayCard title="Absent days" value={loaderData.summary.absentDays} tone="text-[#F59E0B]" suffix="days" />
          <DayCard title="Total hours" value={loaderData.summary.totalHours} tone="text-[#2563EB]" suffix="hrs" />
          <DayCard title="Approved leave" value={loaderData.summary.approvedLeaveDays} tone="text-[#7C3AED]" suffix="days" />
          <DayCard title="Approved OT" value={loaderData.summary.approvedOtHours} tone="text-[#16A34A]" suffix="hrs" />
          <DayCard title="Night shifts" value={loaderData.summary.nightShiftDays} tone="text-[#4338CA]" suffix="days" />
        </div>

        <div className="mt-6 rounded-[1rem] border border-[#FECACA] bg-[#FEF2F2] p-4">
          <h3 className="text-sm font-semibold text-[#DC2626]">Month Summary</h3>
          <p className="mt-2 text-sm text-[#555555]">
            This page now reads from `monthly_daywork_summary`, `attendance`, `leave_requests`, and `ot_requests`
            for the selected month.
          </p>
          {!loaderData.employee?.employeeUuid ? (
            <p className="mt-2 text-sm text-[#B45309]">
              Employee UUID mapping is not available yet, so some monthly metrics may remain at 0 until payroll or attendance mappings are populated.
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Link
            to="/dashboard"
            className="inline-block rounded-xl border border-[#DC2626] bg-white px-4 py-2 font-semibold text-[#DC2626] transition hover:bg-[#FEF2F2]"
          >
            Back
          </Link>
          <Link
            to="/dashboard"
            className="inline-block rounded-xl border border-[#DC2626] bg-white px-4 py-2 font-semibold text-[#DC2626] transition hover:bg-[#FEF2F2]"
          >
            Home
          </Link>
        </div>
      </section>
    </main>
  );
}
