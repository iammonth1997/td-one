import thRequestMessages from "../../public/locales/th/requests.json";
import enRequestMessages from "../../public/locales/en/requests.json";
import loRequestMessages from "../../public/locales/lo/requests.json";

import { getLangFromRequest } from "~/lib/i18n.server";
import { DEFAULT_LANG, type LangCode } from "~/lib/i18n.shared";
import type { RequestMessages } from "~/lib/request-translations";

const REQUEST_MESSAGES_BY_LANG: Record<LangCode, RequestMessages> = {
  th: thRequestMessages as RequestMessages,
  en: enRequestMessages as RequestMessages,
  lo: loRequestMessages as RequestMessages,
};

export async function loadRequestMessages(request: Request) {
  const lang = await getLangFromRequest(request);
  return {
    lang,
    messages: REQUEST_MESSAGES_BY_LANG[lang] ?? REQUEST_MESSAGES_BY_LANG[DEFAULT_LANG] ?? {},
  };
}
