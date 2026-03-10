"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/app/context/LanguageContext";

function CenterCard({ children }) {
  return (
    <main className="min-h-screen bg-[#F5F7FA] px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto w-full max-w-md rounded-2xl border border-[#D0D8E4] bg-white p-5 shadow-[0_4px_24px_rgba(13,59,122,0.10)] sm:max-w-xl sm:p-7">
        {children}
      </section>
    </main>
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

      const sessionRaw = localStorage.getItem("tdone_session");
      let session = null;
      try {
        session = sessionRaw ? JSON.parse(sessionRaw) : null;
      } catch (err) {
        console.error("Failed to parse session:", err);
      }
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
          localStorage.removeItem("tdone_session");
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
  }, [year, month]);

  if (loading) {
    return (
      <CenterCard>
        <div className="flex items-center gap-3 text-[#1352A3]">
          <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
          <span className="font-medium">{L.loading}</span>
        </div>
      </CenterCard>
    );
  }

  if (errorMsg) {
    return (
      <CenterCard>
        <h2 className="text-xl font-bold text-[#1A2B4A]">{L.errTitle}</h2>
        <p className="mt-2 text-[#6B7A99]">{errorMsg}</p>
        <Link
          href="/day-work"
          className="mt-6 inline-block rounded-lg bg-[#1352A3] px-4 py-2 font-semibold text-white transition hover:bg-[#0D3B7A]"
        >
          {L.backBtn}
        </Link>
      </CenterCard>
    );
  }

  if (!daywork) {
    return (
      <CenterCard>
        <h2 className="text-xl font-bold text-[#1A2B4A]">{L.noDataTitle}</h2>
        <p className="mt-2 text-[#6B7A99]">{L.noDataMsg}</p>
        <p className="mt-2 text-sm text-[#6B7A99]">
          Employee: {empId || "-"}, {L.yearLabel}: {year || "-"}, {L.monthLabel}: {month || "-"}
        </p>
        <Link
          href="/day-work"
          className="mt-6 inline-block rounded-lg bg-[#1352A3] px-4 py-2 font-semibold text-white transition hover:bg-[#0D3B7A]"
        >
          {L.changeMonthYear}
        </Link>
      </CenterCard>
    );
  }

  return (
    <CenterCard>
      <div className="mb-6 rounded-xl border border-[#D0D8E4] bg-[#E8F0FB] p-4">
        <h2 className="text-lg font-bold text-[#1352A3]">{L.empInfoTitle}</h2>
        <div className="mt-2 space-y-1 text-sm text-[#334260]">
          <p>{L.empIdLabel}: <span className="font-semibold">{empInfo?.employeeCode || empId || "-"}</span></p>
          <p>
            {L.nameLabel}: <span className="font-semibold">{empInfo?.firstName || "-"} {empInfo?.lastName || ""}</span>
          </p>
          <p>{L.positionLabel}: {empInfo?.positionName || "-"}</p>
          <p>{L.departmentLabel}: {empInfo?.departmentName || "-"}</p>
          <p>{L.workLocationLabel}: {empInfo?.workSiteName || "-"}</p>
        </div>
      </div>

      <h2 className="text-2xl font-bold text-[#1A2B4A] sm:text-3xl">{L.resultTitle}</h2>

      <div className="mt-4 text-[#334260] text-sm space-y-1 mb-4">
        <p>{L.yearLabel}: <span className="font-semibold">{year}</span></p>
        <p>{L.monthLabel}: <span className="font-semibold">{month}</span></p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="rounded-xl border border-[#D0D8E4] bg-white p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-[#1352A3]">{daywork.total_work_days ?? "-"}</div>
          <div className="text-xs text-[#6B7A99] mt-1">{L.totalWorkDays}</div>
          <div className="text-[10px] text-[#6B7A99]">{L.dayUnit}</div>
        </div>
        <div className="rounded-xl border border-[#D0D8E4] bg-white p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-[#F5A623]">{daywork.sick_leave ?? 0}</div>
          <div className="text-xs text-[#6B7A99] mt-1">{L.sickLeave}</div>
          <div className="text-[10px] text-[#6B7A99]">{L.dayUnit}</div>
        </div>
        <div className="rounded-xl border border-[#D0D8E4] bg-white p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-[#1E6CC8]">{daywork.personal_leave ?? 0}</div>
          <div className="text-xs text-[#6B7A99] mt-1">{L.personalLeave}</div>
          <div className="text-[10px] text-[#6B7A99]">{L.dayUnit}</div>
        </div>
        <div className="rounded-xl border border-[#D0D8E4] bg-white p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-[#0D3B7A]">{daywork.annual_leave ?? 0}</div>
          <div className="text-xs text-[#6B7A99] mt-1">{L.annualLeave}</div>
          <div className="text-[10px] text-[#6B7A99]">{L.dayUnit}</div>
        </div>
        <div className="rounded-xl border border-[#D0D8E4] bg-white p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-red-500">{daywork.absent_days ?? 0}</div>
          <div className="text-xs text-[#6B7A99] mt-1">{L.absentDays}</div>
          <div className="text-[10px] text-[#6B7A99]">{L.dayUnit}</div>
        </div>
        <div className="rounded-xl border border-[#D0D8E4] bg-white p-4 text-center shadow-sm">
          <div className="text-2xl font-bold text-[#6B7A99]">{daywork.forgot_scan ?? 0}</div>
          <div className="text-xs text-[#6B7A99] mt-1">{L.forgotScan}</div>
          <div className="text-[10px] text-[#6B7A99]">{L.dayUnit}</div>
        </div>
      </div>

      <Link
        href="/day-work"
        className="mt-6 inline-block rounded-lg border border-[#D0D8E4] px-4 py-2 font-semibold text-[#1352A3] transition hover:bg-[#E8F0FB]"
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
          <p className="text-[#1352A3]">{L.loading}</p>
        </CenterCard>
      }
    >
      <DayWorkViewContent />
    </Suspense>
  );
}
