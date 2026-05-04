import { useEffect } from "react";
import { Link, useSearchParams } from "react-router";
import type { Route } from "./+types/slip.ot.view";
import { SalaryAccessPrompt } from "~/components/salary-access-prompt";
import { useI18n } from "~/lib/i18n";
import { requireSession } from "~/lib/require-session.server";
import { type SalaryAccessMessages, useSalaryProtectedSlip } from "~/lib/use-salary-protected-slip";

type LangCode = "th" | "en" | "lo";

const I18N: Record<LangCode, {
  title: string;
  loading: string;
  noData: string;
  backBtn: string;
  printBtn: string;
  period: string;
  empCode: string;
  empName: string;
  normalOTHours: string;
  normalOTRate: string;
  normalOTAmount: string;
  holidayOTHours: string;
  holidayOTRate: string;
  holidayOTAmount: string;
  incentiveAmount: string;
  totalOTIncentive: string;
  notes: string;
}> = {
  th: {
    title: "พิมพ์สลิปโอที & ค่าแรงจูงใจ",
    loading: "กำลังโหลด...",
    noData: "ไม่มีข้อมูลสลิปสำหรับงวดนี้",
    backBtn: "กลับ",
    printBtn: "พิมพ์",
    period: "งวด",
    empCode: "รหัสพนักงาน",
    empName: "ชื่อพนักงาน",
    normalOTHours: "ชั่วโมง OT ปกติ",
    normalOTRate: "อัตราปกติ",
    normalOTAmount: "จำนวน OT ปกติ",
    holidayOTHours: "ชั่วโมง OT วันหยุด",
    holidayOTRate: "อัตราวันหยุด",
    holidayOTAmount: "จำนวน OT วันหยุด",
    incentiveAmount: "ค่าแรงจูงใจ",
    totalOTIncentive: "รวม OT & แรงจูงใจ",
    notes: "หมายเหตุ",
  },
  en: {
    title: "OT & Incentive Slip Print",
    loading: "Loading...",
    noData: "No slip data available for this period",
    backBtn: "Back",
    printBtn: "Print",
    period: "Period",
    empCode: "Employee Code",
    empName: "Employee Name",
    normalOTHours: "Normal OT Hours",
    normalOTRate: "Normal Rate",
    normalOTAmount: "Normal OT Amount",
    holidayOTHours: "Holiday OT Hours",
    holidayOTRate: "Holiday Rate",
    holidayOTAmount: "Holiday OT Amount",
    incentiveAmount: "Incentive",
    totalOTIncentive: "Total OT & Incentive",
    notes: "Notes",
  },
  lo: {
    title: "ພິມສລິບໂອທີ & ແຮງຈູງໃຈ",
    loading: "ກຳລັງໂຫຼດ...",
    noData: "ບໍ່ມີຂໍ້ມູນສລິບສຳລັບໄລຍະນີ້",
    backBtn: "ກັບຄືນ",
    printBtn: "ພິມ",
    period: "ໄລຍະ",
    empCode: "ລະຫັດພະນັກງານ",
    empName: "ຊື່ພະນັກງານ",
    normalOTHours: "ຊົ່ວໂມງ OT ປົກກະຕິ",
    normalOTRate: "ອັດຕາປົກກະຕິ",
    normalOTAmount: "ຈຳນວນ OT ປົກກະຕິ",
    holidayOTHours: "ຊົ່ວໂມງ OT ວັນພັກ",
    holidayOTRate: "ອັດຕາວັນພັກ",
    holidayOTAmount: "ຈຳນວນ OT ວັນພັກ",
    incentiveAmount: "ແຮງຈູງໃຈ",
    totalOTIncentive: "ລວມ OT & ແຮງຈູງໃຈ",
    notes: "ໝາຍເຫດ",
  },
};

const SALARY_ACCESS_I18N: Record<
  LangCode,
  SalaryAccessMessages & {
    title: string;
    description: string;
    passwordLabel: string;
    passwordPlaceholder: string;
    submitLabel: string;
    submittingLabel: string;
  }
> = {
  th: {
    title: "ยืนยันรหัสผ่านเพื่อพิมพ์สลิป",
    description: "กรุณายืนยันรหัสผ่านอีกครั้งก่อนเปิดสลิป OT สำหรับพิมพ์",
    passwordLabel: "รหัสผ่าน",
    passwordPlaceholder: "กรอกรหัสผ่าน",
    submitLabel: "ยืนยันเพื่อเปิดสลิป",
    submittingLabel: "กำลังยืนยัน...",
    passwordRequired: "กรุณากรอกรหัสผ่าน",
    locked: "ยืนยันรหัสผ่านไม่สำเร็จหลายครั้ง โปรดลองใหม่อีกครั้งในภายหลัง",
    invalid: "รหัสผ่านไม่ถูกต้องหรือสิทธิ์ดูสลิปหมดอายุ กรุณาลองใหม่",
    verifyFailed: "ไม่สามารถยืนยันสิทธิ์ดูสลิปได้ กรุณาลองใหม่",
  },
  en: {
    title: "Confirm password to print the slip",
    description: "Please confirm your password again before opening the printable OT slip.",
    passwordLabel: "Password",
    passwordPlaceholder: "Enter your password",
    submitLabel: "Confirm to open slip",
    submittingLabel: "Confirming...",
    passwordRequired: "Password is required.",
    locked: "Too many failed confirmations. Please try again later.",
    invalid: "Password is incorrect or salary access has expired. Please try again.",
    verifyFailed: "Unable to verify salary access. Please try again.",
  },
  lo: {
    title: "ຢືນຢັນລະຫັດຜ່ານເພື່ອພິມສະລິບ",
    description: "ກະລຸນາຢືນຢັນລະຫັດຜ່ານອີກຄັ້ງກ່ອນເປີດສະລິບ OT ສໍາລັບພິມ",
    passwordLabel: "ລະຫັດຜ່ານ",
    passwordPlaceholder: "ໃສ່ລະຫັດຜ່ານ",
    submitLabel: "ຢືນຢັນເພື່ອເປີດສະລິບ",
    submittingLabel: "ກຳລັງຢືນຢັນ...",
    passwordRequired: "ກະລຸນາໃສ່ລະຫັດຜ່ານ",
    locked: "ຢືນຢັນລະຫັດຜ່ານຜິດຫຼາຍເກີນໄປ ກະລຸນາລອງໃໝ່ພາຍຫຼັງ",
    invalid: "ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ ຫຼື ສິດເບິ່ງສະລິບໝົດອາຍຸແລ້ວ",
    verifyFailed: "ບໍ່ສາມາດຢືນຢັນສິດເບິ່ງສະລິບໄດ້ ກະລຸນາລອງໃໝ່",
  },
};

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireSession(request, context);
  return null;
}

export default function OtSlipViewPage() {
  const [searchParams] = useSearchParams();
  const { lang } = useI18n();
  const salaryAccessCopy = SALARY_ACCESS_I18N[lang];
  const year = Number(searchParams.get("year") || new Date().getFullYear());
  const month = Number(searchParams.get("month") || new Date().getMonth() + 1);
  const day = Number(searchParams.get("day") || 1);
  const shouldPrint = searchParams.get("print") === "1";
  const {
    data,
    error,
    loading,
    salaryAccessError,
    salaryAccessRequired,
    salaryPassword,
    salaryVerifying,
    setSalaryPassword,
    submitSalaryPassword,
  } = useSalaryProtectedSlip("/api/ot-slip", year, month, salaryAccessCopy);

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
          <Link to={`/slip?tab=ot&year=${year}&month=${month}&day=${day}`} className="text-sm font-semibold text-[#991B1B]">← {T.backBtn}</Link>
          <button type="button" onClick={() => window.print()} className="rounded-xl bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white">
            {T.printBtn}
          </button>
        </div>

        <h1 className="text-2xl font-bold text-[#DC2626]">{T.title}</h1>
        <p className="text-sm text-[#555555]">{T.period}: {day}/{month}/{year}</p>

        {loading ? <p className="text-sm text-[#555555]">{T.loading}</p> : null}
        {error ? <p className="text-sm text-[#B91C1C]">{error}</p> : null}
        {salaryAccessRequired ? (
          <SalaryAccessPrompt
            title={salaryAccessCopy.title}
            description={salaryAccessCopy.description}
            password={salaryPassword}
            onPasswordChange={setSalaryPassword}
            onSubmit={() => { void submitSalaryPassword(); }}
            error={salaryAccessError}
            passwordLabel={salaryAccessCopy.passwordLabel}
            passwordPlaceholder={salaryAccessCopy.passwordPlaceholder}
            submitLabel={salaryAccessCopy.submitLabel}
            submittingLabel={salaryAccessCopy.submittingLabel}
            submitting={salaryVerifying}
            className="print:hidden"
          />
        ) : null}

        {!loading && !error && data?.employee ? (
          <div className="space-y-1 rounded-xl border border-[#FECACA] bg-white p-3 text-sm text-[#555555]">
            <p><span className="font-semibold">{T.empCode}:</span> {data.employee.employee_code || "-"}</p>
            <p><span className="font-semibold">{T.empName}:</span> {data.employee.name || "-"}</p>
          </div>
        ) : null}

        {!loading && !error && data?.slip ? (
          <div className="space-y-2">
            {([
              [T.normalOTHours, "ot_normal_hours"],
              [T.normalOTRate, "ot_normal_rate"],
              [T.normalOTAmount, "ot_normal_amount"],
              [T.holidayOTHours, "ot_holiday_hours"],
              [T.holidayOTRate, "ot_holiday_rate"],
              [T.holidayOTAmount, "ot_holiday_amount"],
              [T.incentiveAmount, "incentive_amount"],
            ] as [string, string][]).map(([label, key]) => (
              <div key={key} className="flex justify-between border-b border-[#FECACA] py-2 text-sm text-[#444444]">
                <span>{label}</span>
                <span className="font-semibold">{fmt(data.slip?.[key] as number)}</span>
              </div>
            ))}
            <div className="flex justify-between rounded-xl border-t-2 border-[#DC2626] px-3 py-3 text-sm">
              <span className="font-bold">{T.totalOTIncentive}</span>
              <span className="font-bold text-[#DC2626]">{fmt(data.slip?.total_ot_incentive as number)}</span>
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
