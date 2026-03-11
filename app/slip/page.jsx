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
    return <div className="min-h-screen flex items-center justify-center">{L.loading || "Loading..."}</div>;
  }

  return (
    <main className="min-h-screen bg-[#F5F7FA] px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto max-w-4xl space-y-5">
        <div className="rounded-2xl border border-[#D0D8E4] bg-white p-5 sm:p-7">
          <h1 className="text-2xl font-bold text-[#1352A3]">{L.title || "Slip"}</h1>
        </div>

        <div className="rounded-2xl border border-[#D0D8E4] bg-white p-5 sm:p-7 space-y-5">
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

          {slipLoading && <p className="text-sm text-[#6B7A99]">{L.loading || "Loading..."}</p>}

          {slipError && <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">{slipError}</div>}

          {slipData && (
            <div className="space-y-4">
              <div className="rounded-lg bg-[#F8FAFD] border border-[#D0D8E4] p-4 space-y-2">
                <p className="text-sm text-[#334260]">
                  <span className="font-semibold">{L.empCode}:</span> {slipData.employee?.employee_code || "-"}
                </p>
                <p className="text-sm text-[#334260]">
                  <span className="font-semibold">{L.empName}:</span> {slipData.employee?.name || "-"}
                </p>
              </div>

              {slipData.slip ? (
                tab === "salary" ? (
                  <div className="space-y-3">
                    <h3 className="font-bold text-[#1A2B4A]">{L.salaryBreakdown || "Salary Breakdown"}</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm py-2 border-b border-[#E5EAF0]">
                        <span>{L.basicSalary}</span>
                        <span className="font-semibold">{formatCurrency(slipData.slip.basic_salary)}</span>
                      </div>
                      <div className="flex justify-between text-sm py-2 border-b border-[#E5EAF0]">
                        <span>{L.allowance}</span>
                        <span className="font-semibold">{formatCurrency(slipData.slip.allowance)}</span>
                      </div>
                      <div className="flex justify-between text-sm py-2 border-b border-[#E5EAF0]">
                        <span>{L.bonus}</span>
                        <span className="font-semibold">{formatCurrency(slipData.slip.bonus)}</span>
                      </div>
                      <div className="flex justify-between text-sm py-2 border-b border-[#E5EAF0]">
                        <span>{L.deduction}</span>
                        <span className="font-semibold text-red-600">{formatCurrency(slipData.slip.deduction)}</span>
                      </div>
                      <div className="flex justify-between text-sm py-2 border-b border-[#E5EAF0]">
                        <span>{L.tax}</span>
                        <span className="font-semibold text-red-600">{formatCurrency(slipData.slip.tax)}</span>
                      </div>
                      <div className="flex justify-between text-sm py-3 border-t-2 border-[#1352A3] bg-[#E8F0FB] px-3 rounded">
                        <span className="font-bold">{L.netSalary}</span>
                        <span className="font-bold text-[#1352A3]">{formatCurrency(slipData.slip.net_salary)}</span>
                      </div>
                    </div>
                    {slipData.slip.notes && (
                      <div className="text-xs text-[#6B7A99] mt-3">
                        <span className="font-semibold">{L.notes}:</span> {slipData.slip.notes}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h3 className="font-bold text-[#1A2B4A]">{L.otBreakdown || "OT Breakdown"}</h3>
                    <div className="space-y-2">
                      <div className="rounded-lg border border-[#D0D8E4] p-3 space-y-1 bg-[#F8FAFD]">
                        <p className="text-sm font-semibold text-[#334260]">{L.normalOTHours}</p>
                        <p className="text-lg font-bold text-[#1352A3]">{slipData.slip.ot_normal_hours || "-"} {L.hourUnit || "hrs"}</p>
                      </div>
                      <div className="flex justify-between text-sm py-2 border-b border-[#E5EAF0]">
                        <span>{L.normalOTRate}</span>
                        <span className="font-semibold">{formatCurrency(slipData.slip.ot_normal_rate)}</span>
                      </div>
                      <div className="flex justify-between text-sm py-2 border-b border-[#E5EAF0]">
                        <span>{L.normalOTAmount}</span>
                        <span className="font-semibold">{formatCurrency(slipData.slip.ot_normal_amount)}</span>
                      </div>

                      <div className="rounded-lg border border-[#D0D8E4] p-3 space-y-1 bg-[#F8FAFD] mt-3">
                        <p className="text-sm font-semibold text-[#334260]">{L.holidayOTHours}</p>
                        <p className="text-lg font-bold text-[#1352A3]">{slipData.slip.ot_holiday_hours || "-"} {L.hourUnit || "hrs"}</p>
                      </div>
                      <div className="flex justify-between text-sm py-2 border-b border-[#E5EAF0]">
                        <span>{L.holidayOTRate}</span>
                        <span className="font-semibold">{formatCurrency(slipData.slip.ot_holiday_rate)}</span>
                      </div>
                      <div className="flex justify-between text-sm py-2 border-b border-[#E5EAF0]">
                        <span>{L.holidayOTAmount}</span>
                        <span className="font-semibold">{formatCurrency(slipData.slip.ot_holiday_amount)}</span>
                      </div>

                      <div className="flex justify-between text-sm py-2 border-b border-[#E5EAF0] mt-2">
                        <span>{L.incentiveAmount}</span>
                        <span className="font-semibold text-green-600">{formatCurrency(slipData.slip.incentive_amount)}</span>
                      </div>

                      <div className="flex justify-between text-sm py-3 border-t-2 border-[#1352A3] bg-[#E8F0FB] px-3 rounded">
                        <span className="font-bold">{L.totalOTIncentive}</span>
                        <span className="font-bold text-[#1352A3]">{formatCurrency(slipData.slip.total_ot_incentive)}</span>
                      </div>
                    </div>
                    {slipData.slip.notes && (
                      <div className="text-xs text-[#6B7A99] mt-3">
                        <span className="font-semibold">{L.notes}:</span> {slipData.slip.notes}
                      </div>
                    )}
                  </div>
                )
              ) : (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 text-center">
                  <p className="text-sm text-amber-800">{L.noData || "No slip data available for this period"}</p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-2 pt-4">
                <button onClick={downloadPdf} disabled={!slipData?.slip} className="rounded-lg border border-[#1352A3] px-4 py-2.5 text-[#1352A3] font-semibold hover:bg-[#E8F0FB] disabled:opacity-50">
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
