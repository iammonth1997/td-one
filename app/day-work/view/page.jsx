ทำต่อ
"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/app/context/LanguageContext";
import { readStoredSession, removeStoredSession } from "@/lib/clientSession";

function CenterCard({ children }) {
  return (
    <main className="min-h-screen bg-white px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto w-full max-w-md rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_4px_24px_rgba(220,38,38,0.15)] sm:max-w-xl sm:p-7">
        {children}
      </section>
    </main>
  );
}

function parseDates(str) {
  if (!str) return [];
  return str.split(",").map((d) => d.trim()).filter(Boolean);
}

function DatesList({ dateStr, label }) {
  const dates = parseDates(dateStr);
  if (!dates.length) return null;
  return (
    <div className="mt-2 text-[10px] text-[#555555] leading-relaxed">
      <span className="text-[#777777]">{label} </span>
      {dates.join(", ")}
    </div>
  );
}

function DayWorkViewContent() {
  const params = useSearchParams();
  const year = params.get("year");
  const month = params.get("month");
  const { t } = useLanguage();
  const L = t.dayWorkView;

  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [empId, setEmpId] = useState("");
  const [daywork, setDaywork] = useState(null);
  const [empInfo, setEmpInfo] = useState(null);

  useEffect(() => {
    async function loadData() {
      setLoading(true);
      setErrorMsg("");
      setDaywork(null);
      setEmpInfo(null);

      const yearNum = Number(year);
      const monthNum = Number(month);

      if (!year || !month || !Number.isInteger(yearNum) || !Number.isInteger(monthNum)) {
        setErrorMsg(L.errInvalidParam);
        setLoading(false);
        return;
      }

      const session = readStoredSession("employee_portal");
      const currentEmpId = session?.emp_id || session?.user?.emp_id || null;

      if (!currentEmpId) {
        setErrorMsg(L.errNoSession);
        setLoading(false);
        return;
      }

      setEmpId(currentEmpId);

      const headers = {};
      if (session?.session_token) {
        headers["Authorization"] = `Bearer ${session.session_token}`;
      }

      try {
        const res = await fetch(
          `/api/login/daywork?emp_id=${encodeURIComponent(currentEmpId)}&year=${yearNum}&month=${monthNum}`,
          { headers }
        );

        if (res.status === 401) {
          removeStoredSession("employee_portal");
          window.location.href = "/login";
          return;
        }

        const data = await res.json();

        if (!res.ok) {
          if (data.error === "DAYWORK_NOT_FOUND") {
            setDaywork(null);
          } else if (data.error === "EMPLOYEE_NOT_FOUND") {
            setErrorMsg(L.errEmpNotFound);
          } else {
            setErrorMsg(data.detail || L.errNetwork);
          }
          setLoading(false);
          return;
        }

        setDaywork(data.daywork || null);

        const emp = data.employee;
        if (emp) {
          setEmpInfo({
            employeeCode: emp.employee_code || currentEmpId,
            firstName: emp.first_name_th || "-",
            lastName: emp.last_name_th || "",
            positionName: emp.position?.name || "-",
            departmentName: emp.department?.name || "-",
            workSiteName: emp.work_site?.name || "-",
          });
        }
      } catch (err) {
        console.error("Failed to fetch daywork:", err);
        setErrorMsg(L.errNetwork);
      }

      setLoading(false);
    }

    loadData();
  }, [year, month, L]);

  if (loading) {
    return (
      <CenterCard>
        <div className="flex items-center gap-3 text-[#DC2626]">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          <span className="font-medium">{L.loading}</span>
        </div>
      </CenterCard>
    );
  }

  if (errorMsg) {
    return (
      <CenterCard>
        <h2 className="text-xl font-bold text-[#DC2626]">{L.errTitle}</h2>
        <p className="mt-2 text-[#555555]">{errorMsg}</p>
        <Link
          href="/day-work"
          className="mt-6 inline-block rounded-xl border border-[#DC2626] bg-white px-4 py-2 font-semibold text-[#DC2626] transition hover:bg-[#FEF2F2]"
        >
          {L.backBtn}
        </Link>
      </CenterCard>
    );
  }

  if (!daywork) {
    return (
      <CenterCard>
        <h2 className="text-xl font-bold text-[#DC2626]">{L.noDataTitle}</h2>
        <p className="mt-2 text-[#555555]">{L.noDataMsg}</p>
        <p className="mt-2 text-sm text-[#555555]">
          Employee: {empId || "-"}, {L.yearLabel}: {year || "-"}, {L.monthLabel}: {month || "-"}
        </p>
        <Link
          href="/day-work"
          className="mt-6 inline-block rounded-xl border border-[#DC2626] bg-white px-4 py-2 font-semibold text-[#DC2626] transition hover:bg-[#FEF2F2]"
        >
          {L.changeMonthYear}
        </Link>
      </CenterCard>
    );
  }

  return (
    <CenterCard>
      <div className="mb-6 rounded-[1rem] border border-[#FECACA] bg-[#FEF2F2] p-4">
        <h2 className="text-lg font-bold text-[#DC2626]">{L.empInfoTitle}</h2>
        <div className="mt-2 space-y-1 text-sm text-[#444444]">
          <p>{L.empIdLabel}: <span className="font-semibold">{empInfo?.employeeCode || empId || "-"}</span></p>
          <p>
            {L.nameLabel}: <span className="font-semibold">{empInfo?.firstName || "-"} {empInfo?.lastName || ""}</span>
          </p>
          <p>{L.positionLabel}: {empInfo?.positionName || "-"}</p>
          <p>{L.departmentLabel}: {empInfo?.departmentName || "-"}</p>
          <p>{L.workLocationLabel}: {empInfo?.workSiteName || "-"}</p>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-[#DC2626] sm:text-3xl">{L.resultTitle}</h2>

      <div className="mb-4 mt-4 space-y-1 text-sm text-[#555555]">
        <p>{L.yearLabel}: <span className="font-semibold text-[#111111]">{year}</span></p>
        <p>{L.monthLabel}: <span className="font-semibold text-[#111111]">{month}</span></p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-[1rem] border border-[#FECACA] bg-white p-4 text-center shadow-[0_4px_16px_rgba(220,38,38,0.08)]">
          <div className="text-2xl font-bold text-[#DC2626]">{daywork.work_days ?? "-"}</div>
          <div className="mt-1 text-xs text-[#555555]">{L.workDays}</div>
          <div className="text-[10px] text-[#888888]">{L.dayUnit}</div>
        </div>
        <div className="rounded-[1rem] border border-[#FECACA] bg-white p-4 text-center shadow-[0_4px_16px_rgba(220,38,38,0.08)]">
          <div className="text-2xl font-bold text-[#EF4444]">{daywork.sl_days ?? 0}</div>
          <div className="mt-1 text-xs text-[#555555]">{L.sickLeave}</div>
          <div className="text-[10px] text-[#888888]">{L.dayUnit}</div>
          <DatesList dateStr={daywork.sl_date} label={L.datesLabel} />
        </div>
        <div className="rounded-[1rem] border border-[#FECACA] bg-white p-4 text-center shadow-[0_4px_16px_rgba(220,38,38,0.08)]">
          <div className="text-2xl font-bold text-[#3B82F6]">{daywork.pl_days ?? 0}</div>
          <div className="mt-1 text-xs text-[#555555]">{L.personalLeave}</div>
          <div className="text-[10px] text-[#888888]">{L.dayUnit}</div>
          <DatesList dateStr={daywork.pl_date} label={L.datesLabel} />
        </div>
        <div className="rounded-[1rem] border border-[#FECACA] bg-white p-4 text-center shadow-[0_4px_16px_rgba(220,38,38,0.08)]">
          <div className="text-2xl font-bold text-[#F59E0B]">{daywork.vl_days ?? 0}</div>
          <div className="mt-1 text-xs text-[#555555]">{L.annualLeave}</div>
          <div className="text-[10px] text-[#888888]">{L.dayUnit}</div>
          <DatesList dateStr={daywork.vl_date} label={L.datesLabel} />
        </div>
        <div className="rounded-[1rem] border border-[#FECACA] bg-white p-4 text-center shadow-[0_4px_16px_rgba(220,38,38,0.08)]">
          <div className="text-2xl font-bold text-red-500">{daywork.opl_days ?? 0}</div>
          <div className="mt-1 text-xs text-[#555555]">{L.unpaidLeave}</div>
          <div className="text-[10px] text-[#888888]">{L.dayUnit}</div>
          <DatesList dateStr={daywork.opl_date} label={L.datesLabel} />
        </div>
        <div className="rounded-[1rem] border border-[#FECACA] bg-white p-4 text-center shadow-[0_4px_16px_rgba(220,38,38,0.08)]">
          <div className="text-2xl font-bold text-[#555555]">{daywork.no_scan ?? 0}</div>
          <div className="mt-1 text-xs text-[#555555]">{L.noScan}</div>
          <div className="text-[10px] text-[#888888]">{L.dayUnit}</div>
          <DatesList dateStr={daywork.noscan_date} label={L.datesLabel} />
        </div>
        <div className="rounded-[1rem] border border-[#FECACA] bg-white p-4 text-center shadow-[0_4px_16px_rgba(220,38,38,0.08)]">
          <div className="text-2xl font-bold text-[#A855F7]">{daywork.rt_days ?? 0}</div>
          <div className="mt-1 text-xs text-[#555555]">{L.restDays}</div>
          <div className="text-[10px] text-[#888888]">{L.dayUnit}</div>
          <DatesList dateStr={daywork.rt_date} label={L.datesLabel} />
        </div>
        <div className="rounded-[1rem] border border-[#FECACA] bg-white p-4 text-center shadow-[0_4px_16px_rgba(220,38,38,0.08)]">
          <div className="text-2xl font-bold text-[#F97316]">{daywork.off_days ?? 0}</div>
          <div className="mt-1 text-xs text-[#555555]">{L.officialOff}</div>
          <div className="text-[10px] text-[#888888]">{L.dayUnit}</div>
          <DatesList dateStr={daywork.off_date} label={L.datesLabel} />
        </div>
        <div className="rounded-[1rem] border border-[#FECACA] bg-white p-4 text-center shadow-[0_4px_16px_rgba(220,38,38,0.08)]">
          <div className="text-2xl font-bold text-[#22C55E]">{daywork.night_shift_count ?? 0}</div>
          <div className="mt-1 text-xs text-[#555555]">{L.nightShift}</div>
          <div className="text-[10px] text-[#888888]">{L.dayUnit}</div>
          <DatesList dateStr={daywork.night_shift_dates} label={L.datesLabel} />
        </div>
      </div>

      <div className="mt-6 rounded-[1rem] border border-[#FECACA] bg-[#FEF2F2] p-4">
        <h3 className="text-sm font-semibold text-[#DC2626]">{L.attendanceMetrics}</h3>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <div className="text-sm text-[#555555]">{L.attendanceRate}</div>
            <div className="text-lg font-bold text-[#DC2626]">{daywork.attendance_rate != null ? Math.round(parseFloat(daywork.attendance_rate) * 100) : "0"}%</div>
          </div>
          <div>
            <div className="text-sm text-[#555555]">{L.totalLeave}</div>
            <div className="text-lg font-bold text-[#F59E0B]">{daywork.total_leave ?? 0}</div>
          </div>
          <div>
            <div className="text-sm text-[#555555]">{L.totalUnpaid}</div>
            <div className="text-lg font-bold text-red-500">{daywork.total_unpaid ?? 0}</div>
          </div>
          <div>
            <div className="text-sm text-[#555555]">{L.totalPaidDays}</div>
            <div className="text-lg font-bold text-[#16A34A]">{daywork.total_paid_days ?? 28}</div>
          </div>
        </div>
      </div>

      <Link
        href="/day-work"
        className="mt-6 inline-block rounded-xl border border-[#DC2626] bg-white px-4 py-2 font-semibold text-[#DC2626] transition hover:bg-[#FEF2F2]"
      >
        {L.backBtn}
      </Link>
    </CenterCard>
  );
}

export default function DayWorkViewPage() {
  const { t } = useLanguage();
  const L = t.dayWorkView;

  return (
    <Suspense
      fallback={
        <CenterCard>
          <p className="text-[#555555]">{L.loading}</p>
        </CenterCard>
      }
    >
      <DayWorkViewContent />
    </Suspense>
  );
}
