"use client";

import { useLanguage } from "@/app/context/LanguageContext";

const LANGS = [
  { code: "th", label: "ไทย" },
  { code: "lo", label: "ລາວ" },
  { code: "en", label: "EN" },
];

export default function LanguageSwitcher() {
  const { lang, setLang } = useLanguage();

  return (
    <div className="flex gap-1 rounded-xl border border-[#FECACA] bg-white p-1 shadow-[0_6px_18px_rgba(220,38,38,0.08)]">
      {LANGS.map(({ code, label }) => (
        <button
          key={code}
          onClick={() => setLang(code)}
          className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
            lang === code
              ? "bg-[#DC2626] text-white"
              : "bg-transparent text-[#555555] hover:bg-[#FEF2F2] hover:text-[#DC2626]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
