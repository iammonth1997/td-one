"use client";

import { createContext, useContext, useEffect, useState } from "react";
import th from "@/app/locales/th";
import lo from "@/app/locales/lo";
import en from "@/app/locales/en";

const translations = { th, lo, en };

const LanguageContext = createContext({
  lang: "th",
  t: th,
  setLang: () => {},
});

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState("th");

  useEffect(() => {
    const saved = localStorage.getItem("tdone_lang");
    if (saved && translations[saved]) {
      setLangState(saved);
    }
  }, []);

  function setLang(newLang) {
    if (!translations[newLang]) return;
    setLangState(newLang);
    localStorage.setItem("tdone_lang", newLang);
  }

  return (
    <LanguageContext.Provider value={{ lang, t: translations[lang], setLang }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
