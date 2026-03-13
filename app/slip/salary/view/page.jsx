"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/app/context/LanguageContext";
import { readStoredSession } from "@/lib/clientSession";

function CenterCard({ children }) {
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-lg sm:max-w-xl sm:p-7">
        {children}
      </section>
    </main>
  );
}

function SlipSalaryViewContent() {
  const params = useSearchParams();
  const year = params.get("year");
  const month = params.get("month");
  const day = params.get("day");
  const { t } = useLanguage();
  const L = t.slipView;

  const session = readStoredSession("employee_portal");
  const errorMsg = session?.emp_id ? "" : L.errNoSession;
  const empInfo = session?.emp_id ? { empId: session.emp_id } : null;

  if (errorMsg) {
    return (
      <CenterCard>
        <p className="mt-2 text-slate-600">{errorMsg}</p>
        <Link
          href="/slip/salary"
          className="mt-6 inline-block rounded-lg bg-[#1352A3] px-4 py-2 font-semibold text-white transition hover:bg-[#0D3B7A]"
        >
          {L.backBtn}
        </Link>
      </CenterCard>
    );
  }

  return (
    <CenterCard>
      <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h2 className="text-lg font-bold text-slate-900">{L.empInfoTitle}</h2>
        <div className="mt-2 space-y-1 text-sm text-slate-700">
          <p>{L.empIdLabel}: {empInfo?.empId || "-"}</p>
          <p>{L.dayLabel}: {day}</p>
          <p>{L.monthLabel}: {month}</p>
          <p>{L.yearLabel}: {year}</p>
        </div>
      </div>

      <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-6 text-center">
        <p className="text-2xl mb-2">🚧</p>
        <h2 className="text-xl font-bold text-yellow-700">{L.comingSoon}</h2>
        <p className="mt-2 text-sm text-yellow-600">{L.comingSoonDesc}</p>
      </div>

      <Link
        href="/slip/salary"
        className="mt-6 inline-block rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700 transition hover:bg-slate-50"
      >
        {L.backBtn}
      </Link>
    </CenterCard>
  );
}

export default function SlipSalaryViewPage() {
  const { t } = useLanguage();
  const L = t.slipView;

  return (
    <Suspense
      fallback={
        <CenterCard>
          <p className="text-slate-700">{L.loading}</p>
        </CenterCard>
      }
    >
      <SlipSalaryViewContent />
    </Suspense>
  );
}
