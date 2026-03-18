"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/context/LanguageContext";
import { useSession } from "@/app/hooks/useSession";

export default function SlipPage() {
  const router = useRouter();
  const { session, loading, getAuthHeaders } = useSession();
  const { t, lang } = useLanguage();
  const L = t.slipPage || {};

  const now = new Date();
  const [tab, setTab] = useState("salary");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [slipData, setSlipData] = useState(null);
  const [slipLoading, setSlipLoading] = useState(false);
  const [slipError, setSlipError] = useState("");

  const years = useMemo(() => [2025, 2026, 2027, 2028], []);

  async function loadSlip() {
    if (!session) return;
    setSlipLoading(true);
    setSlipError("");
    setSlipData(null);

    try {
      const endpoint = tab === "salary" ? "/api/salary-slip" : "/api/ot-slip";
      const url = `${endpoint}?year=${year}&month=${month}`;
      const res = await fetch(url, { headers: getAuthHeaders() });
      const data = await res.json();

      if (!res.ok) {
        setSlipError(data.error || "LOAD_FAILED");
        return;
      }

      setSlipData(data);
    } finally {
      setSlipLoading(false);
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    loadSlip();
  }, [loading, session, tab, year, month, router]);

  function downloadPdf() {
    if (!slipData?.slip) return;
    const path = tab === "salary" ? "/slip/salary/view" : "/slip/ot/view";
    window.open(`${path}?year=${year}&month=${month}&day=1&print=1`, "_blank");
  }

  const formatCurrency = (value) => {
    if (value === null || value === undefined) return "-";
    return Number(value).toLocaleString(lang === "th" ? "th-TH" : lang === "lo" ? "lo-LA" : "en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
    });
  };

  if (loading || !session) {
    return <div className="flex min-h-screen items-center justify-center bg-white text-[#555555]">{L.loading || "Loading..."}</div>;
  }

  return (
    <main className="min-h-screen bg-white px-4 py-6 text-[#111111] sm:px-6 sm:py-10">
      <section className="mx-auto max-w-4xl space-y-5">
        <div className="rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_4px_24px_rgba(220,38,38,0.10)] sm:p-7">
          <h1 className="text-2xl font-bold text-[#DC2626]">{L.title || "Slip"}</h1>
        </div>

        <div className="space-y-5 rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_4px_24px_rgba(220,38,38,0.10)] sm:p-7">
          <div className="grid grid-cols-1 gap-2 rounded-xl border border-[#FECACA] bg-white p-1 sm:grid-cols-2">
            <button
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === "salary" ? "bg-white text-[#DC2626] shadow-[0_10px_20px_rgba(220,38,38,0.16)]" : "bg-white text-[#555555]"}`}
              onClick={() => setTab("salary")}
            >
              {L.salaryTab || "Salary Slip"}
            </button>
            <button
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${tab === "ot" ? "bg-white text-[#DC2626] shadow-[0_10px_20px_rgba(220,38,38,0.16)]" : "bg-white text-[#555555]"}`}
              onClick={() => setTab("ot")}
            >
              {L.otTab || "OT & Incentive Slip"}
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-[#555555]">{L.monthLabel || "Month"}</label>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111]">
                {(t.dayWork?.months || []).map((name, idx) => (
                  <option key={idx + 1} value={idx + 1}>{name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-[#555555]">{L.yearLabel || "Year"}</label>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111]">
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {slipLoading && <p className="text-sm text-[#555555]">{L.loading || "Loading..."}</p>}

          {slipError && <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3 text-sm text-[#B91C1C]">{slipError}</div>}

          {slipData && (
            <div className="space-y-4">
              <div className="space-y-2 rounded-xl border border-[#FECACA] bg-white p-4">
                <p className="text-sm text-[#555555]">
                  <span className="font-semibold">{L.empCode}:</span> {slipData.employee?.employee_code || "-"}
                </p>
                <p className="text-sm text-[#555555]">
                  <span className="font-semibold">{L.empName}:</span> {slipData.employee?.name || "-"}
                </p>
              </div>

              {slipData.slip ? (
                tab === "salary" ? (
                  <div className="space-y-3">
                    <h3 className="font-bold text-[#DC2626]">{L.salaryBreakdown || "Salary Breakdown"}</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between border-b border-[#FECACA] py-2 text-sm text-[#444444]">
                        <span>{L.basicSalary}</span>
                        <span className="font-semibold">{formatCurrency(slipData.slip.basic_salary)}</span>
                      </div>
                      <div className="flex justify-between border-b border-[#FECACA] py-2 text-sm text-[#444444]">
                        <span>{L.allowance}</span>
                        <span className="font-semibold">{formatCurrency(slipData.slip.allowance)}</span>
                      </div>
                      <div className="flex justify-between border-b border-[#FECACA] py-2 text-sm text-[#444444]">
                        <span>{L.bonus}</span>
                        <span className="font-semibold">{formatCurrency(slipData.slip.bonus)}</span>
                      </div>
                      <div className="flex justify-between border-b border-[#FECACA] py-2 text-sm text-[#444444]">
                        <span>{L.deduction}</span>
                        <span className="font-semibold text-red-600">{formatCurrency(slipData.slip.deduction)}</span>
                      </div>
                      <div className="flex justify-between border-b border-[#FECACA] py-2 text-sm text-[#444444]">
                        <span>{L.tax}</span>
                        <span className="font-semibold text-red-600">{formatCurrency(slipData.slip.tax)}</span>
                      </div>
                      <div className="flex justify-between rounded-xl border-t-2 border-[#DC2626] bg-white px-3 py-3 text-sm">
                        <span className="font-bold">{L.netSalary}</span>
                        <span className="font-bold text-[#DC2626]">{formatCurrency(slipData.slip.net_salary)}</span>
                      </div>
                    </div>
                    {slipData.slip.notes && (
                      <div className="mt-3 text-xs text-[#555555]">
                        <span className="font-semibold">{L.notes}:</span> {slipData.slip.notes}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h3 className="font-bold text-[#DC2626]">{L.otBreakdown || "OT Breakdown"}</h3>
                    <div className="space-y-2">
                      <div className="space-y-1 rounded-xl border border-[#FECACA] bg-white p-3">
                        <p className="text-sm font-semibold text-[#444444]">{L.normalOTHours}</p>
                        <p className="text-lg font-bold text-[#F59E0B]">{slipData.slip.ot_normal_hours || "-"} {L.hourUnit || "hrs"}</p>
                      </div>
                      <div className="flex justify-between border-b border-[#FECACA] py-2 text-sm text-[#444444]">
                        <span>{L.normalOTRate}</span>
                        <span className="font-semibold">{formatCurrency(slipData.slip.ot_normal_rate)}</span>
                      </div>
                      <div className="flex justify-between border-b border-[#FECACA] py-2 text-sm text-[#444444]">
                        <span>{L.normalOTAmount}</span>
                        <span className="font-semibold">{formatCurrency(slipData.slip.ot_normal_amount)}</span>
                      </div>

                      <div className="mt-3 space-y-1 rounded-xl border border-[#FECACA] bg-white p-3">
                        <p className="text-sm font-semibold text-[#444444]">{L.holidayOTHours}</p>
                        <p className="text-lg font-bold text-[#F59E0B]">{slipData.slip.ot_holiday_hours || "-"} {L.hourUnit || "hrs"}</p>
                      </div>
                      <div className="flex justify-between border-b border-[#FECACA] py-2 text-sm text-[#444444]">
                        <span>{L.holidayOTRate}</span>
                        <span className="font-semibold">{formatCurrency(slipData.slip.ot_holiday_rate)}</span>
                      </div>
                      <div className="flex justify-between border-b border-[#FECACA] py-2 text-sm text-[#444444]">
                        <span>{L.holidayOTAmount}</span>
                        <span className="font-semibold">{formatCurrency(slipData.slip.ot_holiday_amount)}</span>
                      </div>

                      <div className="mt-2 flex justify-between border-b border-[#FECACA] py-2 text-sm text-[#444444]">
                        <span>{L.incentiveAmount}</span>
                        <span className="font-semibold text-green-600">{formatCurrency(slipData.slip.incentive_amount)}</span>
                      </div>

                      <div className="flex justify-between rounded-xl border-t-2 border-[#DC2626] bg-white px-3 py-3 text-sm">
                        <span className="font-bold">{L.totalOTIncentive}</span>
                        <span className="font-bold text-[#DC2626]">{formatCurrency(slipData.slip.total_ot_incentive)}</span>
                      </div>
                    </div>
                    {slipData.slip.notes && (
                      <div className="mt-3 text-xs text-[#555555]">
                        <span className="font-semibold">{L.notes}:</span> {slipData.slip.notes}
                      </div>
                    )}
                  </div>
                )
              ) : (
                <div className="rounded-xl border border-[#FCD34D] bg-[#FFF7ED] p-4 text-center">
                  <p className="text-sm text-[#B45309]">{L.noData || "No slip data available for this period"}</p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-4">
                <button onClick={downloadPdf} disabled={!slipData?.slip} className="rounded-xl bg-[#DC2626] px-4 py-2.5 font-semibold text-white transition hover:bg-[#991B1B] disabled:opacity-50">
                  {L.downloadBtn || "Download PDF"}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
