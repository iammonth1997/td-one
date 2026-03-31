export type LangCode = "th" | "en" | "lo";

export const DEFAULT_LANG: LangCode = "th";
export const LANGUAGES = ["th", "en", "lo"] as const;
export const LANGUAGE_STORAGE_KEY = "tdone_lang";
export const LANGUAGE_COOKIE_NAME = "tdone_lang";
export const LANGUAGE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const LOCALE_BY_LANG: Record<LangCode, string> = {
  th: "th-TH",
  en: "en-US",
  lo: "lo-LA",
};

export function isLangCode(value: unknown): value is LangCode {
  return value === "th" || value === "en" || value === "lo";
}

export function parseLangCode(value: unknown): LangCode {
  return isLangCode(value) ? value : DEFAULT_LANG;
}

export const MONTHS_BY_LANG: Record<LangCode, string[]> = {
  th: ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"],
  en: ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"],
  lo: ["ມັງກອນ", "ກຸມພາ", "ມີນາ", "ເມສາ", "ພຶດສະພາ", "ມິຖຸນາ", "ກໍລະກົດ", "ສິງຫາ", "ກັນຍາ", "ຕຸລາ", "ພະຈິກ", "ທັນວາ"],
};

export function getLocaleTag(lang: LangCode) {
  return LOCALE_BY_LANG[lang] || LOCALE_BY_LANG[DEFAULT_LANG];
}

export function getMonthNames(lang: LangCode) {
  return MONTHS_BY_LANG[lang] || MONTHS_BY_LANG[DEFAULT_LANG];
}
