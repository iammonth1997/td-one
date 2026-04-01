import thDashboardMessages from "../../public/locales/th/dashboard.json";
import enDashboardMessages from "../../public/locales/en/dashboard.json";
import loDashboardMessages from "../../public/locales/lo/dashboard.json";

import { getLangFromRequest } from "~/lib/i18n.server";
import { DEFAULT_LANG, type LangCode } from "~/lib/i18n.shared";
import type { DashboardMessages } from "~/lib/dashboard-translations";

const DASHBOARD_MESSAGES_BY_LANG: Record<LangCode, DashboardMessages> = {
  th: thDashboardMessages as DashboardMessages,
  en: enDashboardMessages as DashboardMessages,
  lo: loDashboardMessages as DashboardMessages,
};

export async function loadDashboardMessages(request: Request) {
  const lang = await getLangFromRequest(request);
  return {
    lang,
    messages: DASHBOARD_MESSAGES_BY_LANG[lang] ?? DASHBOARD_MESSAGES_BY_LANG[DEFAULT_LANG] ?? {},
  };
}
