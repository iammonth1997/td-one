import { useState, useEffect, useMemo } from "react";
import { Link, redirect } from "react-router";
import type { Route } from "./+types/slip";
import { validateSession } from "~/lib/session-validation.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { session, error } = await validateSession(request, context);
  if (error || !session) throw redirect("/login");
  return { empId: session.emp_id };
}

const MONTHS = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];

type SlipData = {
  employee: { employee_code: string; name: string } | null;
  slip: Record<string, number | string | null> | null;
};

export default function SlipPage(_props: Route.ComponentProps) {
  const now = new Date();
  const [tab, setTab] = useState<"salary" | "ot">("salary");
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [slipData, setSlipData] = useState<SlipData | null>(null);
  const [slipLoading, setSlipLoading] = useState(false);
  const [slipError, setSlipError] = useState("");

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y - 1, y, y + 1, y + 2];
  }, []);

  async function loadSlip() {
    setSlipLoading(true);
    setSlipError("");
    setSlipData(null);
    try {
      const endpoint = tab === "salary" ? "/api/salary-slip" : "/api/ot-slip";
      const res = await fetch(`${endpoint}?year=${year}&month=${month}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      if (!res.ok) { setSlipError(data.error || "LOAD_FAILED"); return; }
      setSlipData(data);
    } finally {
      setSlipLoading(false);
    }
  }

  useEffect(() => { loadSlip(); }, [tab, year, month]);

  const fmt = (v: number | string | null | undefined) => {
    if (v === null || v === undefined) return "-";
    return Number(v).toLocaleString("th-TH", { minimumFractionDigits: 2 });
  };

  const openPrint = () => {
    const path = tab === "salary" ? "/slip/salary/view" : "/slip/ot/view";
    window.open(`${path}?year=${year}&month=${month}&day=1&print=1`, "_blank");
  };

  return (
    <main className="min-h-screen bg-white px-4 py-6 text-[#111111] sm:px-6 sm:py-10">
      <section className="mx-auto max-w-4xl space-y-5">
        <div className="flex items-center justify-between rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_4px_24px_rgba(220,38,38,0.10)]">
          <h1 className="text-2xl font-bold text-[#DC2626]">💰 สลิป</h1>
          <Link to="/dashboard" className="text-sm text-[#DC2626] transition hover:text-[#991B1B]">← Dashboard</Link>
        </div>

        <div className="space-y-5 rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_4px_24px_rgba(220,38,38,0.10)]">
          {/* Tab switcher */}
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-1">
            <button onClick={() => setTab("salary")} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === "salary" ? "bg-white text-[#DC2626] shadow-md" : "text-[#555555] hover:text-[#DC2626]"}">`}>
              💵 สลิปเงินเดือน
            </button>
            <button onClick={() => setTab("ot")} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === "ot" ? "bg-white text-[#DC2626] shadow-md" : "text-[#555555] hover:text-[#DC2626]"}`}>
              ⚡ สลิป OT &amp; ค่าแรงจูงใจ
            </button>
          </div>

          {/* Month/Year selector */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-[#555555]">เดือน</label>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] focus:border-[#DC2626]">
                {MONTHS.map((name, i) => (<option key={i + 1} value={i + 1}>{name}</option>))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-[#555555]">ปี</label>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] focus:border-[#DC2626]">
                {years.map((y) => (<option key={y} value={y}>{y}</option>))}
              </select>
            </div>
          </div>

          {slipLoading && <p className="text-sm text-[#555555]">กำลังโหลด...</p>}
          {slipError && <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3 text-sm text-[#B91C1C]">{slipError}</div>}

          {slipData && (
            <div className="space-y-4">
              <div className="space-y-1 rounded-xl border border-[#FECACA] bg-white p-3 text-sm text-[#555555]">
                <p><span className="font-semibold">รหัสพนักงาน:</span> {slipData.employee?.employee_code ?? "-"}</p>
                <p><span className="font-semibold">ชื่อ:</span> {slipData.employee?.name ?? "-"}</p>
              </div>

              {slipData.slip ? (
                tab === "salary" ? (
                  <div className="space-y-2">
                    <h3 className="font-bold text-[#DC2626]">รายละเอียดเงินเดือน</h3>
                    {([
                      ["เงินเดือนพื้นฐาน", "basic_salary", false],
                      ["เบี้ยเลี้ยงและเบี้ยเสริม", "allowance", false],
                      ["โบนัส", "bonus", false],
                      ["หัก", "deduction", true],
                      ["ภาษี", "tax", true],
                    ] as [string, string, boolean][]).map(([label, key, neg]) => (
                      <div key={key} className="flex justify-between border-b border-[#FECACA] py-2 text-sm text-[#444444]">
                        <span>{label}</span>
                        <span className={`font-semibold ${neg ? "text-[#DC2626]" : ""}`}>{fmt(slipData.slip?.[key] as number)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between rounded-xl border-t-2 border-[#DC2626] px-3 py-3 text-sm">
                      <span className="font-bold">เงินสุทธิ์</span>
                      <span className="font-bold text-[#DC2626]">{fmt(slipData.slip?.net_salary as number)}</span>
                    </div>
                    {slipData.slip?.notes ? <p className="text-xs text-[#555555]">หมายเหตุ: {slipData.slip.notes as string}</p> : null}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <h3 className="font-bold text-[#DC2626]">รายละเอียด OT</h3>
                    {([
                      ["OT ปกติ (ชั่วโมง)", "ot_normal_hours", false],
                      ["อัตรา OT ปกติ", "ot_normal_rate", false],
                      ["ยอด OT ปกติ", "ot_normal_amount", false],
                      ["OT วันหยุด (ชั่วโมง)", "ot_holiday_hours", false],
                      ["อัตรา OT วันหยุด", "ot_holiday_rate", false],
                      ["ยอด OT วันหยุด", "ot_holiday_amount", false],
                      ["ค่าแรงจูงใจ", "incentive_amount", false],
                    ] as [string, string, boolean][]).map(([label, key, neg]) => (
                      <div key={key} className="flex justify-between border-b border-[#FECACA] py-2 text-sm text-[#444444]">
                        <span>{label}</span>
                        <span className={`font-semibold ${neg ? "text-[#DC2626]" : ""}`}>{fmt(slipData.slip?.[key] as number)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between rounded-xl border-t-2 border-[#DC2626] px-3 py-3 text-sm">
                      <span className="font-bold">ยอด OT+ค่าแรงจูงใจ</span>
                      <span className="font-bold text-[#DC2626]">{fmt(slipData.slip?.total_ot_incentive as number)}</span>
                    </div>
                    {slipData.slip?.notes ? <p className="text-xs text-[#555555]">หมายเหตุ: {slipData.slip.notes as string}</p> : null}
                  </div>
                )
              ) : (
                <div className="rounded-xl border border-[#FCD34D] bg-[#FFF7ED] p-4 text-center">
                  <p className="text-sm text-[#B45309]">ไม่มีข้อมูลสลิปในช่วงเวลานี้</p>
                </div>
              )}

              <button onClick={openPrint} disabled={!slipData.slip} className="rounded-xl bg-[#DC2626] px-4 py-2.5 font-semibold text-white transition hover:bg-[#991B1B] disabled:opacity-50">
                🖨️ ดู/พิมพ์ PDF
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}

// appease compiler - original file had these unused imports
const _unused = { Link }; void _unused;
