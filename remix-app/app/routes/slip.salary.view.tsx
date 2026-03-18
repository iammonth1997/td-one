import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/slip.salary.view";
import { requireSession } from "~/lib/require-session.server";

type LangCode = "th" | "en" | "lo";

type SlipData = {
  employee: { employee_code: string; name: string } | null;
  slip: Record<string, number | string | null> | null;
};

const I18N: Record<LangCode, {
  title: string;
  loading: string;
  noData: string;
  backBtn: string;
  printBtn: string;
  period: string;
  empCode: string;
  empName: string;
  basicSalary: string;
  allowance: string;
  bonus: string;
  deduction: string;
  tax: string;
  netSalary: string;
  notes: string;
}> = {
  th: {
    title: "พิมพ์สลิปเงินเดือน",
    loading: "กำลังโหลด...",
    noData: "ไม่มีข้อมูลสลิปสำหรับงวดนี้",
    backBtn: "กลับ",
    printBtn: "พิมพ์",
    period: "งวด",
    empCode: "รหัสพนักงาน",
    empName: "ชื่อพนักงาน",
    basicSalary: "เงินเดือนขั้นพื้นฐาน",
    allowance: "เบี้ยประกอบ",
    bonus: "โบนัส",
    deduction: "หักลบ",
    tax: "ภาษี",
    netSalary: "เงินเดือนสุทธิ",
    notes: "หมายเหตุ",
  },
  en: {
    title: "Salary Slip Print",
    loading: "Loading...",
    noData: "No slip data available for this period",
    backBtn: "Back",
    printBtn: "Print",
    period: "Period",
    empCode: "Employee Code",
    empName: "Employee Name",
    basicSalary: "Basic Salary",
    allowance: "Allowance",
    bonus: "Bonus",
    deduction: "Deduction",
    tax: "Tax",
    netSalary: "Net Salary",
    notes: "Notes",
  },
  lo: {
    title: "ພິມສລິບເງິນເດືອນ",
    loading: "ກຳລັງໂຫຼດ...",
    noData: "ບໍ່ມີຂໍ້ມູນສລິບສຳລັບໄລຍະນີ້",
    backBtn: "ກັບຄືນ",
    printBtn: "ພິມ",
    period: "ໄລຍະ",
    empCode: "ລະຫັດພະນັກງານ",
    empName: "ຊື່ພະນັກງານ",
    basicSalary: "ເງິນເດືອນຂັ້ນພື້ນຖານ",
    allowance: "ເບື້ອງປະກອບ",
    bonus: "ໂບນັດ",
    deduction: "ຫັກອອກ",
    tax: "ອາກອນ",
    netSalary: "ເງິນເດືອນສຸດທິ",
    notes: "ໝາຍເຫດ",
  },
};

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireSession(request, context);
  return null;
}

export default function SalarySlipViewPage() {
  const [searchParams] = useSearchParams();
  const [lang, setLang] = useState<LangCode>("th");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [data, setData] = useState<SlipData | null>(null);

  const year = Number(searchParams.get("year") || new Date().getFullYear());
  const month = Number(searchParams.get("month") || new Date().getMonth() + 1);
  const day = Number(searchParams.get("day") || 1);
  const shouldPrint = searchParams.get("print") === "1";

  useEffect(() => {
    const saved = localStorage.getItem("tdone_lang");
    if (saved === "th" || saved === "en" || saved === "lo") {
      setLang(saved);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");
      setData(null);
      try {
        const res = await fetch(`/api/salary-slip?year=${year}&month=${month}`);
        const json = (await res.json()) as {
          error?: string;
          employee?: SlipData["employee"];
          slip?: SlipData["slip"];
        };

        if (!res.ok) {
          if (!cancelled) setError(json.error || "LOAD_FAILED");
          return;
        }

        if (!cancelled) {
          setData({ employee: json.employee || null, slip: json.slip || null });
        }
      } catch {
        if (!cancelled) setError("LOAD_FAILED");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  useEffect(() => {
    if (!shouldPrint || loading) return;
    const timer = window.setTimeout(() => window.print(), 200);
    return () => window.clearTimeout(timer);
  }, [shouldPrint, loading, data]);

  const T = I18N[lang];

  const fmt = (v: number | string | null | undefined) => {
    if (v === null || v === undefined) return "-";
    const locale = lang === "en" ? "en-US" : lang === "lo" ? "lo-LA" : "th-TH";
    return Number(v).toLocaleString(locale, { minimumFractionDigits: 2 });
  };

  return (
    <main className="min-h-screen bg-white px-4 py-6 text-[#111111] sm:px-6 sm:py-10 print:px-0 print:py-0">
      <section className="mx-auto max-w-3xl space-y-4 rounded-2xl border border-[#FECACA] bg-white p-6 shadow-[0_10px_28px_rgba(220,38,38,0.10)] print:max-w-none print:rounded-none print:border-0 print:p-4 print:shadow-none">
        <div className="flex items-center justify-between print:hidden">
          <Link to={`/slip?tab=salary&year=${year}&month=${month}&day=${day}`} className="text-sm font-semibold text-[#991B1B]">← {T.backBtn}</Link>
          <button type="button" onClick={() => window.print()} className="rounded-xl bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white">
            {T.printBtn}
          </button>
        </div>

        <h1 className="text-2xl font-bold text-[#DC2626]">{T.title}</h1>
        <p className="text-sm text-[#555555]">{T.period}: {day}/{month}/{year}</p>

        {loading ? <p className="text-sm text-[#555555]">{T.loading}</p> : null}
        {error ? <p className="text-sm text-[#B91C1C]">{error}</p> : null}

        {!loading && !error && data?.employee ? (
          <div className="space-y-1 rounded-xl border border-[#FECACA] bg-white p-3 text-sm text-[#555555]">
            <p><span className="font-semibold">{T.empCode}:</span> {data.employee.employee_code || "-"}</p>
            <p><span className="font-semibold">{T.empName}:</span> {data.employee.name || "-"}</p>
          </div>
        ) : null}

        {!loading && !error && data?.slip ? (
          <div className="space-y-2">
            {([
              [T.basicSalary, "basic_salary", false],
              [T.allowance, "allowance", false],
              [T.bonus, "bonus", false],
              [T.deduction, "deduction", true],
              [T.tax, "tax", true],
            ] as [string, string, boolean][]).map(([label, key, neg]) => (
              <div key={key} className="flex justify-between border-b border-[#FECACA] py-2 text-sm text-[#444444]">
                <span>{label}</span>
                <span className={`font-semibold ${neg ? "text-[#DC2626]" : ""}`}>{fmt(data.slip?.[key] as number)}</span>
              </div>
            ))}
            <div className="flex justify-between rounded-xl border-t-2 border-[#DC2626] px-3 py-3 text-sm">
              <span className="font-bold">{T.netSalary}</span>
              <span className="font-bold text-[#DC2626]">{fmt(data.slip?.net_salary as number)}</span>
            </div>
            {data.slip.notes ? <p className="text-xs text-[#555555]">{T.notes}: {String(data.slip.notes)}</p> : null}
          </div>
        ) : null}

        {!loading && !error && !data?.slip ? (
          <div className="rounded-xl border border-[#FCD34D] bg-[#FFF7ED] p-4 text-center">
            <p className="text-sm text-[#B45309]">{T.noData}</p>
          </div>
        ) : null}
      </section>
    </main>
  );
}
