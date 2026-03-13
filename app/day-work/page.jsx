"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/context/LanguageContext";
import { readStoredSession } from "@/lib/clientSession";

export default function DayWorkSelectPage() {
  const router = useRouter();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth() + 1);
  const { t } = useLanguage();
  const L = t.dayWork;

  useEffect(() => {
    if (!readStoredSession("employee_portal")) {
      router.push("/login");
    }
  }, [router]);

  const handleSubmit = () => {
    router.push(`/day-work/view?year=${year}&month=${month}`);
  };

  return (
    <main className="min-h-screen bg-[#F5F7FA] px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto w-full max-w-md rounded-2xl border border-[#D0D8E4] bg-white p-5 shadow-[0_4px_24px_rgba(13,59,122,0.10)] sm:max-w-lg sm:p-7">
        <h1 className="text-2xl font-bold text-[#1352A3] sm:text-3xl">{L.title}</h1>

        <div className="mt-6 space-y-5">
          <div>
            <label className="mb-2 block text-sm font-semibold text-[#334260]">{L.selectYear}</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="block w-full rounded-lg border border-[#D0D8E4] bg-white px-3 py-2 text-[#1A2B4A] outline-none focus:border-[#1352A3]"
            >
              <option value="2025">2025</option>
              <option value="2026">2026</option>
              <option value="2027">2027</option>
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-[#334260]">{L.selectMonth}</label>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              className="block w-full rounded-lg border border-[#D0D8E4] bg-white px-3 py-2 text-[#1A2B4A] outline-none focus:border-[#1352A3]"
            >
              {L.months.map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          className="mt-7 w-full rounded-lg bg-[#1352A3] px-4 py-3 font-semibold text-white transition hover:bg-[#0D3B7A] active:scale-[0.99]"
        >
          {L.viewBtn}
        </button>
      </section>
    </main>
  );
}
