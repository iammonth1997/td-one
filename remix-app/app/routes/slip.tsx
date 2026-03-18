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

type LangCode = "th" | "en" | "lo";

const MONTHS_BY_LANG: Record<LangCode, string[]> = {
  th: ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  lo: ["ມັງກອນ", "ກຸມພາ", "ມີນາ", "ເມສາ", "ພຶດສະພາ", "ມິຖຸນາ", "ກໍລະກົດ", "ສິງຫາ", "ກັນຍາ", "ຕຸລາ", "ພະຈິກ", "ທັນວາ"],
};

const SLIP_I18N: Record<LangCode, {
  title: string;
  salaryTab: string;
  otTab: string;
  monthLabel: string;
  yearLabel: string;
  loading: string;
  noData: string;
  empCode: string;
  empName: string;
  salaryBreakdown: string;
  basicSalary: string;
  allowance: string;
  bonus: string;
  deduction: string;
  tax: string;
  netSalary: string;
  otBreakdown: string;
  normalOTHours: string;
  normalOTRate: string;
  normalOTAmount: string;
  holidayOTHours: string;
  holidayOTRate: string;
  holidayOTAmount: string;
  incentiveAmount: string;
  totalOTIncentive: string;
  notes: string;
  back: string;
  print: string;
}> = {
  th: {
    title: "สลิป",
    salaryTab: "สลิปเงินเดือน",
    otTab: "สลิปโอที & ค่าแรงจูงใจ",
    monthLabel: "เดือน",
    yearLabel: "ปี",
    loading: "กำลังโหลด...",
    noData: "ไม่มีข้อมูลสลิปสำหรับงวดนี้",
    empCode: "รหัสพนักงาน",
    empName: "ชื่อพนักงาน",
    salaryBreakdown: "รายละเอียดเงินเดือน",
    basicSalary: "เงินเดือนขั้นพื้นฐาน",
    allowance: "เบี้ยประกอบ",
    bonus: "โบนัส",
    deduction: "หักลบ",
    tax: "ภาษี",
    netSalary: "เงินเดือนสุทธิ",
    otBreakdown: "รายละเอียด OT",
    normalOTHours: "ชั่วโมง OT ปกติ",
    normalOTRate: "อัตราปกติ",
    normalOTAmount: "จำนวน OT ปกติ",
    holidayOTHours: "ชั่วโมง OT วันหยุด",
    holidayOTRate: "อัตราวันหยุด",
    holidayOTAmount: "จำนวน OT วันหยุด",
    incentiveAmount: "ค่าแรงจูงใจ",
    totalOTIncentive: "รวม OT & แรงจูงใจ",
    notes: "หมายเหตุ",
    back: "Dashboard",
    print: "ดู/พิมพ์ PDF",
  },
  en: {
    title: "Slip",
    salaryTab: "Salary Slip",
    otTab: "OT & Incentive Slip",
    monthLabel: "Month",
    yearLabel: "Year",
    loading: "Loading...",
    noData: "No slip data available for this period",
    empCode: "Employee Code",
    empName: "Employee Name",
    salaryBreakdown: "Salary Breakdown",
    basicSalary: "Basic Salary",
    allowance: "Allowance",
    bonus: "Bonus",
    deduction: "Deduction",
    tax: "Tax",
    netSalary: "Net Salary",
    otBreakdown: "OT Breakdown",
    normalOTHours: "Normal OT Hours",
    normalOTRate: "Normal Rate",
    normalOTAmount: "Normal OT Amount",
    holidayOTHours: "Holiday OT Hours",
    holidayOTRate: "Holiday Rate",
    holidayOTAmount: "Holiday OT Amount",
    incentiveAmount: "Incentive",
    totalOTIncentive: "Total OT & Incentive",
    notes: "Notes",
    back: "Dashboard",
    print: "View/Print PDF",
  },
  lo: {
    title: "ສລິບ",
    salaryTab: "ສລິບເງິນເດືອນ",
    otTab: "ສລິບໂອທີ & ແຮງຈູງໃຈ",
    monthLabel: "ເດືອນ",
    yearLabel: "ປີ",
    loading: "ກຳລັງໂຫຼດ...",
    noData: "ບໍ່ມີຂໍ້ມູນສລິບສຳລັບໄລຍະນີ້",
    empCode: "ລະຫັດພະນັກງານ",
    empName: "ຊື່ພະນັກງານ",
    salaryBreakdown: "ລາຍລະອຽດເງິນເດືອນ",
    basicSalary: "ເງິນເດືອນຂັ້ນພື້ນຖານ",
    allowance: "ເບື້ອງປະກອບ",
    bonus: "ໂບນສ",
    deduction: "ຫັກອອກ",
    tax: "ອາກອນ",
    netSalary: "ເງິນເດືອນສຸດທິ",
    otBreakdown: "ລາຍລະອຽດ OT",
    normalOTHours: "ຊົ່ວໂມງ OT ປົກກະຕິ",
    normalOTRate: "ອັດຕາປົກກະຕິ",
    normalOTAmount: "ຈຳນວນ OT ປົກກະຕິ",
    holidayOTHours: "ຊົ່ວໂມງ OT ວັນພັກ",
    holidayOTRate: "ອັດຕາວັນພັກ",
    holidayOTAmount: "ຈຳນວນ OT ວັນພັກ",
    incentiveAmount: "ແຮງຈູງໃຈ",
    totalOTIncentive: "ລວມ OT & ແຮງຈູງໃຈ",
    notes: "ໝາຍເຫດ",
    back: "Dashboard",
    print: "ເບິ່ງ/ພິມ PDF",
  },
};

type SlipData = {
  employee: { employee_code: string; name: string } | null;
  slip: Record<string, number | string | null> | null;
};

export default function SlipPage(_props: Route.ComponentProps) {
  const now = new Date();
  const [lang, setLang] = useState<LangCode>("th");
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

  useEffect(() => {
    const saved = localStorage.getItem("tdone_lang");
    if (saved === "th" || saved === "en" || saved === "lo") {
      setLang(saved);
    }
  }, []);

  function changeLanguage(next: LangCode) {
    setLang(next);
    localStorage.setItem("tdone_lang", next);
  }

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
    const locale = lang === "en" ? "en-US" : lang === "lo" ? "lo-LA" : "th-TH";
    return Number(v).toLocaleString(locale, { minimumFractionDigits: 2 });
  };

  const openPrint = () => {
    const path = tab === "salary" ? "/slip/salary/view" : "/slip/ot/view";
    window.open(`${path}?year=${year}&month=${month}&day=1&print=1`, "_blank");
  };

  const T = SLIP_I18N[lang];
  const monthNames = MONTHS_BY_LANG[lang] || MONTHS;

  return (
    <main className="min-h-screen bg-white px-4 py-6 text-[#111111] sm:px-6 sm:py-10">
      <section className="mx-auto max-w-4xl space-y-5">
        <div className="flex items-center justify-between rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_4px_24px_rgba(220,38,38,0.10)]">
          <h1 className="text-2xl font-bold text-[#DC2626]">💰 {T.title}</h1>
          <div className="flex items-center gap-1">
            {(["th", "en", "lo"] as LangCode[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => changeLanguage(code)}
                className={`rounded-full border px-2 py-1 text-[10px] font-bold transition ${
                  lang === code
                    ? "border-[#DC2626] bg-[#DC2626] text-white"
                    : "border-[#FECACA] bg-white text-[#555555]"
                }`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
          <Link to="/dashboard" className="text-sm text-[#DC2626] transition hover:text-[#991B1B]">← {T.back}</Link>
        </div>

        <div className="space-y-5 rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_4px_24px_rgba(220,38,38,0.10)]">
          {/* Tab switcher */}
          <div className="grid grid-cols-2 gap-1 rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-1">
            <button onClick={() => setTab("salary")} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === "salary" ? "bg-white text-[#DC2626] shadow-md" : "text-[#555555] hover:text-[#DC2626]"}">`}>
              💵 {T.salaryTab}
            </button>
            <button onClick={() => setTab("ot")} className={`rounded-lg px-3 py-2 text-sm font-semibold transition ${tab === "ot" ? "bg-white text-[#DC2626] shadow-md" : "text-[#555555] hover:text-[#DC2626]"}`}>
              ⚡ {T.otTab}
            </button>
          </div>

          {/* Month/Year selector */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-semibold text-[#555555]">{T.monthLabel}</label>
              <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] focus:border-[#DC2626]">
                {monthNames.map((name, i) => (<option key={i + 1} value={i + 1}>{name}</option>))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-[#555555]">{T.yearLabel}</label>
              <select value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] focus:border-[#DC2626]">
                {years.map((y) => (<option key={y} value={y}>{y}</option>))}
              </select>
            </div>
          </div>

          {slipLoading && <p className="text-sm text-[#555555]">{T.loading}</p>}
          {slipError && <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3 text-sm text-[#B91C1C]">{slipError}</div>}

          {slipData && (
            <div className="space-y-4">
              <div className="space-y-1 rounded-xl border border-[#FECACA] bg-white p-3 text-sm text-[#555555]">
                <p><span className="font-semibold">{T.empCode}:</span> {slipData.employee?.employee_code ?? "-"}</p>
                <p><span className="font-semibold">{T.empName}:</span> {slipData.employee?.name ?? "-"}</p>
              </div>

              {slipData.slip ? (
                tab === "salary" ? (
                  <div className="space-y-2">
                    <h3 className="font-bold text-[#DC2626]">{T.salaryBreakdown}</h3>
                    {([
                      [T.basicSalary, "basic_salary", false],
                      [T.allowance, "allowance", false],
                      [T.bonus, "bonus", false],
                      [T.deduction, "deduction", true],
                      [T.tax, "tax", true],
                    ] as [string, string, boolean][]).map(([label, key, neg]) => (
                      <div key={key} className="flex justify-between border-b border-[#FECACA] py-2 text-sm text-[#444444]">
                        <span>{label}</span>
                        <span className={`font-semibold ${neg ? "text-[#DC2626]" : ""}`}>{fmt(slipData.slip?.[key] as number)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between rounded-xl border-t-2 border-[#DC2626] px-3 py-3 text-sm">
                      <span className="font-bold">{T.netSalary}</span>
                      <span className="font-bold text-[#DC2626]">{fmt(slipData.slip?.net_salary as number)}</span>
                    </div>
                    {slipData.slip?.notes ? <p className="text-xs text-[#555555]">{T.notes}: {slipData.slip.notes as string}</p> : null}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <h3 className="font-bold text-[#DC2626]">{T.otBreakdown}</h3>
                    {([
                      [T.normalOTHours, "ot_normal_hours", false],
                      [T.normalOTRate, "ot_normal_rate", false],
                      [T.normalOTAmount, "ot_normal_amount", false],
                      [T.holidayOTHours, "ot_holiday_hours", false],
                      [T.holidayOTRate, "ot_holiday_rate", false],
                      [T.holidayOTAmount, "ot_holiday_amount", false],
                      [T.incentiveAmount, "incentive_amount", false],
                    ] as [string, string, boolean][]).map(([label, key, neg]) => (
                      <div key={key} className="flex justify-between border-b border-[#FECACA] py-2 text-sm text-[#444444]">
                        <span>{label}</span>
                        <span className={`font-semibold ${neg ? "text-[#DC2626]" : ""}`}>{fmt(slipData.slip?.[key] as number)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between rounded-xl border-t-2 border-[#DC2626] px-3 py-3 text-sm">
                      <span className="font-bold">{T.totalOTIncentive}</span>
                      <span className="font-bold text-[#DC2626]">{fmt(slipData.slip?.total_ot_incentive as number)}</span>
                    </div>
                    {slipData.slip?.notes ? <p className="text-xs text-[#555555]">{T.notes}: {slipData.slip.notes as string}</p> : null}
                  </div>
                )
              ) : (
                <div className="rounded-xl border border-[#FCD34D] bg-[#FFF7ED] p-4 text-center">
                  <p className="text-sm text-[#B45309]">{T.noData}</p>
                </div>
              )}

              <button onClick={openPrint} disabled={!slipData.slip} className="rounded-xl bg-[#DC2626] px-4 py-2.5 font-semibold text-white transition hover:bg-[#991B1B] disabled:opacity-50">
                🖨️ {T.print}
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
