import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router";
import type { Route } from "./+types/slip.ot";
import { useI18n } from "~/lib/i18n";
import { getMonthNames } from "~/lib/i18n.shared";
import { requireSession } from "~/lib/require-session.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  await requireSession(request, context);
  return null;
}

type LangCode = "th" | "en" | "lo";

const I18N: Record<LangCode, {
  titleOT: string;
  selectDay: string;
  selectMonth: string;
  selectYear: string;
  viewBtn: string;
  backBtn: string;
  months: string[];
}> = {
  th: {
    titleOT: "สลิปโอที & ค่าแรงจูงใจ",
    selectDay: "เลือกวันที่",
    selectMonth: "เลือกเดือน",
    selectYear: "เลือกปี",
    viewBtn: "ดูข้อมูล",
    backBtn: "กลับ",
    months: ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"],
  },
  en: {
    titleOT: "OT & Incentive Slip",
    selectDay: "Select Day",
    selectMonth: "Select Month",
    selectYear: "Select Year",
    viewBtn: "View Data",
    backBtn: "Back",
    months: ["January","February","March","April","May","June","July","August","September","October","November","December"],
  },
  lo: {
    titleOT: "ສລິບໂອທີ & ຄ່າແຮງຈູງໃຈ",
    selectDay: "ເລືອກວັນທີ",
    selectMonth: "ເລືອກເດືອນ",
    selectYear: "ເລືອກປີ",
    viewBtn: "ເບິ່ງຂໍ້ມູນ",
    backBtn: "ກັບຄືນ",
    months: ["ມັງກອນ","ກຸມພາ","ມີນາ","ເມສາ","ພຶດສະພາ","ມິຖຸນາ","ກໍລະກົດ","ສິງຫາ","ກັນຍາ","ຕຸລາ","ພະຈິກ","ທັນວາ"],
  },
};

export default function OtSlipPage() {
  const navigate = useNavigate();
  const now = new Date();
  const { lang, setLang } = useI18n();
  const [year, setYear] = useState(() => now.getFullYear());
  const [month, setMonth] = useState(() => now.getMonth() + 1);
  const [day, setDay] = useState(() => now.getDate());

  const L = I18N[lang];

  const years = useMemo(() => {
    const y = now.getFullYear();
    return [y - 1, y, y + 1, y + 2];
  }, [now]);

  const daysInMonth = new Date(year, month, 0).getDate();

  function handleMonthChange(value: string) {
    const nextMonth = Number(value);
    const nextDaysInMonth = new Date(year, nextMonth, 0).getDate();
    setMonth(nextMonth);
    setDay((currentDay) => Math.min(currentDay, nextDaysInMonth));
  }

  function handleYearChange(value: string) {
    const nextYear = Number(value);
    const nextDaysInMonth = new Date(nextYear, month, 0).getDate();
    setYear(nextYear);
    setDay((currentDay) => Math.min(currentDay, nextDaysInMonth));
  }

  function handleSubmit() {
    navigate(`/slip?tab=ot&year=${year}&month=${month}&day=${day}`);
  }

  return (
    <main className="min-h-screen bg-white px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto max-w-3xl rounded-2xl border border-[#FECACA] bg-white p-6 shadow-[0_10px_28px_rgba(220,38,38,0.10)]">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#111111]">{L.titleOT}</h1>
          <div className="flex items-center gap-1">
            {(["th", "en", "lo"] as LangCode[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => setLang(code)}
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
        </div>

        <div className="space-y-4">
          <div>
            <label className="mb-2 block text-sm font-semibold text-[#555555]">{L.selectDay}</label>
            <select
              value={day}
              onChange={(e) => setDay(Number(e.target.value))}
              className="block w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] outline-none focus:border-[#DC2626]"
            >
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-[#555555]">{L.selectMonth}</label>
            <select
              value={month}
              onChange={(e) => handleMonthChange(e.target.value)}
              className="block w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] outline-none focus:border-[#DC2626]"
            >
              {getMonthNames(lang).map((name, i) => (
                <option key={i + 1} value={i + 1}>{name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-semibold text-[#555555]">{L.selectYear}</label>
            <select
              value={year}
              onChange={(e) => handleYearChange(e.target.value)}
              className="block w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] outline-none focus:border-[#DC2626]"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          onClick={handleSubmit}
          className="mt-7 w-full rounded-xl bg-[#DC2626] px-4 py-3 font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.24)] transition hover:bg-[#991B1B] active:scale-[0.99]"
        >
          {L.viewBtn}
        </button>

        <Link to="/slip" className="mt-4 inline-block text-sm font-semibold text-[#991B1B]">{L.backBtn}</Link>
      </section>
    </main>
  );
}
