import { Link, redirect } from "react-router";
import type { Route } from "./+types/day-work.view";
import { validateSession } from "~/lib/session-validation.server";
import { getSupabaseServerClient } from "~/lib/supabase.server";

function parseDates(value: unknown) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function DayCard({ title, value, tone, dates }: { title: string; value: number | string; tone: string; dates?: string[] }) {
  return (
    <div className="rounded-[1rem] border border-[#FECACA] bg-white p-4 text-center shadow-[0_4px_16px_rgba(220,38,38,0.08)]">
      <div className={`text-2xl font-bold ${tone}`}>{value}</div>
      <div className="mt-1 text-xs text-[#555555]">{title}</div>
      {dates && dates.length > 0 && (
        <div className="mt-2 text-[10px] leading-relaxed text-[#555555]">{dates.join(", ")}</div>
      )}
    </div>
  );
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { session, error } = await validateSession(request, context);
  if (error || !session) {
    throw redirect("/login");
  }

  const url = new URL(request.url);
  const year = Number(url.searchParams.get("year"));
  const month = Number(url.searchParams.get("month"));

  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { error: "Invalid year/month parameter.", year: null, month: null, employee: null, daywork: null };
  }

  const { supabaseServer } = getSupabaseServerClient(context);

  const { data: work, error: workError } = await supabaseServer
    .from("attendance_monthly")
    .select("*")
    .eq("emp_id", session.emp_id)
    .eq("month", month)
    .eq("year", year)
    .maybeSingle();

  const { data: emp } = await supabaseServer
    .from("employees")
    .select("employee_code, first_name_th, last_name_th, position_id, department_id, work_site_id")
    .eq("employee_code", session.emp_id)
    .maybeSingle();

  let positionName: string | null = null;
  let departmentName: string | null = null;
  let workSiteName: string | null = null;

  if (emp) {
    const [posRes, deptRes, siteRes] = await Promise.all([
      emp.position_id
        ? supabaseServer.from("positions").select("title_th").eq("id", emp.position_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      emp.department_id
        ? supabaseServer.from("departments").select("name_th").eq("id", emp.department_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      emp.work_site_id
        ? supabaseServer.from("work_sites").select("name_th").eq("id", emp.work_site_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ]);

    positionName = posRes.data?.title_th || null;
    departmentName = deptRes.data?.name_th || null;
    workSiteName = siteRes.data?.name_th || null;
  }

  const employee = emp
    ? {
        employeeCode: emp.employee_code,
        firstName: emp.first_name_th,
        lastName: emp.last_name_th,
        positionName,
        departmentName,
        workSiteName,
      }
    : null;

  if (workError || !work) {
    return {
      error: null,
      year,
      month,
      employee,
      daywork: null,
    };
  }

  return {
    error: null,
    year,
    month,
    employee,
    daywork: work,
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
              to="/day-work"
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

  if (!loaderData.daywork) {
    return (
      <main className="min-h-screen bg-white px-4 py-6 sm:px-6 sm:py-10">
        <section className="mx-auto w-full max-w-xl rounded-[1rem] border border-[#FECACA] bg-white p-6 shadow-[0_4px_24px_rgba(220,38,38,0.15)]">
          <h2 className="text-xl font-bold text-[#DC2626]">No data found</h2>
          <p className="mt-2 text-[#555555]">
            Employee: {loaderData.employee?.employeeCode || "-"}, Year: {loaderData.year || "-"}, Month: {loaderData.month || "-"}
          </p>
          <div className="mt-6 flex items-center justify-between">
            <Link
              to="/day-work"
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

  const daywork = loaderData.daywork;

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
          <DayCard title="Work days" value={daywork.work_days ?? "-"} tone="text-[#DC2626]" />
          <DayCard title="Sick leave" value={daywork.sl_days ?? 0} tone="text-[#EF4444]" dates={parseDates(daywork.sl_date)} />
          <DayCard title="Personal leave" value={daywork.pl_days ?? 0} tone="text-[#3B82F6]" dates={parseDates(daywork.pl_date)} />
          <DayCard title="Annual leave" value={daywork.vl_days ?? 0} tone="text-[#F59E0B]" dates={parseDates(daywork.vl_date)} />
          <DayCard title="Unpaid leave" value={daywork.opl_days ?? 0} tone="text-red-500" dates={parseDates(daywork.opl_date)} />
          <DayCard title="No scan" value={daywork.no_scan ?? 0} tone="text-[#555555]" dates={parseDates(daywork.noscan_date)} />
          <DayCard title="Rest days" value={daywork.rt_days ?? 0} tone="text-[#A855F7]" dates={parseDates(daywork.rt_date)} />
          <DayCard title="Official off" value={daywork.off_days ?? 0} tone="text-[#F97316]" dates={parseDates(daywork.off_date)} />
          <DayCard
            title="Night shift"
            value={daywork.night_shift_count ?? 0}
            tone="text-[#22C55E]"
            dates={parseDates(daywork.night_shift_dates)}
          />
        </div>

        <div className="mt-6 rounded-[1rem] border border-[#FECACA] bg-[#FEF2F2] p-4">
          <h3 className="text-sm font-semibold text-[#DC2626]">Attendance metrics</h3>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <div className="text-sm text-[#555555]">Attendance rate</div>
              <div className="text-lg font-bold text-[#DC2626]">
                {daywork.attendance_rate != null ? Math.round(parseFloat(String(daywork.attendance_rate)) * 100) : 0}%
              </div>
            </div>
            <div>
              <div className="text-sm text-[#555555]">Total leave</div>
              <div className="text-lg font-bold text-[#F59E0B]">{daywork.total_leave ?? 0}</div>
            </div>
            <div>
              <div className="text-sm text-[#555555]">Total unpaid</div>
              <div className="text-lg font-bold text-red-500">{daywork.total_unpaid ?? 0}</div>
            </div>
            <div>
              <div className="text-sm text-[#555555]">Total paid days</div>
              <div className="text-lg font-bold text-[#16A34A]">{daywork.total_paid_days ?? 0}</div>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <Link
            to="/day-work"
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
