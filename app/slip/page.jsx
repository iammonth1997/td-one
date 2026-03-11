"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/context/LanguageContext";

export default function SlipPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const L = t.slipPage || {};

  const now = new Date();
  const [tab, setTab] = useState("salary");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const years = useMemo(() => [2025, 2026, 2027, 2028], []);

  function openView() {
    const path = tab === "salary" ? "/slip/salary/view" : "/slip/ot/view";
    router.push(`${path}?year=${year}&month=${month}&day=1`);
  }

  function downloadPdf() {
    const path = tab === "salary" ? "/slip/salary/view" : "/slip/ot/view";
    window.open(`${path}?year=${year}&month=${month}&day=1&print=1`, "_blank");
  }

  return (
    <main className="min-h-screen bg-[#F5F7FA] px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto max-w-3xl rounded-2xl border border-[#D0D8E4] bg-white p-5 sm:p-7 shadow-[0_4px_24px_rgba(13,59,122,0.08)] space-y-5">
        <h1 className="text-2xl font-bold text-[#1352A3]">{L.title || "Slip"}</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-xl bg-[#E8F0FB] p-1">
          <button
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === "salary" ? "bg-white text-[#1352A3] shadow" : "text-[#334260]"}`}
            onClick={() => setTab("salary")}
          >
            {L.salaryTab || "Salary Slip"}
          </button>
          <button
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === "ot" ? "bg-white text-[#1352A3] shadow" : "text-[#334260]"}`}
            onClick={() => setTab("ot")}
          >
            {L.otTab || "OT & Incentive Slip"}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-semibold text-[#334260]">{L.monthLabel || "Month"}</label>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-full rounded-lg border border-[#D0D8E4] px-3 py-2">
              {(t.dayWork?.months || []).map((name, idx) => (
                <option key={idx + 1} value={idx + 1}>{name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-semibold text-[#334260]">{L.yearLabel || "Year"}</label>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-full rounded-lg border border-[#D0D8E4] px-3 py-2">
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <button onClick={openView} className="rounded-lg bg-[#1352A3] px-4 py-2.5 text-white font-semibold">
            {L.viewBtn || "View Slip"}
          </button>
          <button onClick={downloadPdf} className="rounded-lg border border-[#1352A3] px-4 py-2.5 text-[#1352A3] font-semibold">
            {L.downloadBtn || "Download PDF"}
          </button>
        </div>
      </section>
    </main>
  );
}
