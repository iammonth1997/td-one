"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useLanguage } from "@/app/context/LanguageContext";
import { readStoredSession } from "@/lib/clientSession";

function CenterCard({ children }) {
  return (
    <main className="min-h-screen bg-white px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto w-full max-w-md rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_4px_24px_rgba(220,38,38,0.10)] sm:max-w-xl sm:p-7">
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
        <p className="mt-2 text-[#555555]">{errorMsg}</p>
        <Link
          href="/slip/salary"
          className="mt-6 inline-block rounded-xl border border-[#FECACA] bg-white px-4 py-2 font-semibold text-[#DC2626] transition hover:bg-[#FEF2F2]"
        >
          {L.backBtn}
        </Link>
      </CenterCard>
    );
  }

  return (
    <CenterCard>
      <div className="mb-6 rounded-[1rem] border border-[#FECACA] bg-white p-4">
        <h2 className="text-lg font-bold text-[#DC2626]">{L.empInfoTitle}</h2>
        <div className="mt-2 space-y-1 text-sm text-[#555555]">
          <p>{L.empIdLabel}: {empInfo?.empId || "-"}</p>
          <p>{L.dayLabel}: {day}</p>
          <p>{L.monthLabel}: {month}</p>
          <p>{L.yearLabel}: {year}</p>
        </div>
      </div>

      <div className="rounded-[1rem] border border-[#FCD34D] bg-[#FFF7ED] p-6 text-center">
        <p className="text-2xl mb-2">🚧</p>
        <h2 className="text-xl font-bold text-[#B45309]">{L.comingSoon}</h2>
        <p className="mt-2 text-sm text-[#92400E]">{L.comingSoonDesc}</p>
      </div>

      <Link
        href="/slip/salary"
        className="mt-6 inline-block rounded-xl border border-[#FECACA] bg-white px-4 py-2 font-semibold text-[#DC2626] transition hover:bg-[#FEF2F2]"
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
          <p className="text-[#555555]">{L.loading}</p>
        </CenterCard>
      }
    >
      <SlipSalaryViewContent />
    </Suspense>
  );
}
