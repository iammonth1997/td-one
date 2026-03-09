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
    <div className="flex gap-1">
      {LANGS.map(({ code, label }) => (
        <button
          key={code}
          onClick={() => setLang(code)}
          className={`px-2 py-1 rounded text-xs font-semibold transition ${
            lang === code
              ? "bg-[#1352A3] text-white"
              : "bg-[#E8F0FB] text-[#1352A3] hover:bg-[#D0D8E4]"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
