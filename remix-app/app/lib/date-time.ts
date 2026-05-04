const BANGKOK_TIME_ZONE = "Asia/Bangkok";

type DateInput = Date | string | number | null | undefined;

export function formatBangkokDateTime(value: DateInput, locale = "th-TH") {
  if (!value) return "-";
  return new Date(value).toLocaleString(locale, { timeZone: BANGKOK_TIME_ZONE });
}

export function formatBangkokDate(value: DateInput, locale = "th-TH") {
  if (!value) return "-";
  return new Date(value).toLocaleDateString(locale, { timeZone: BANGKOK_TIME_ZONE });
}
