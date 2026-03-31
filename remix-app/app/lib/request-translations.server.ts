import { getLangFromRequest } from "~/lib/i18n.server";
import { DEFAULT_LANG, type LangCode } from "~/lib/i18n.shared";
import type { RequestMessages } from "~/lib/request-translations";

const requestMessagesCache = new Map<LangCode, RequestMessages>();
const requestMessagesPending = new Map<LangCode, Promise<RequestMessages>>();

async function fetchRequestMessages(request: Request, lang: LangCode) {
  const url = new URL(`/locales/${lang}/requests.json`, request.url);
  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Unable to load request translations for ${lang}`);
  }

  return (await response.json()) as RequestMessages;
}

async function getCachedRequestMessages(request: Request, lang: LangCode) {
  const cached = requestMessagesCache.get(lang);
  if (cached) {
    return cached;
  }

  const pending = requestMessagesPending.get(lang);
  if (pending) {
    return pending;
  }

  const fetchPromise = fetchRequestMessages(request, lang)
    .then((messages) => {
      requestMessagesCache.set(lang, messages);
      requestMessagesPending.delete(lang);
      return messages;
    })
    .catch((error) => {
      requestMessagesPending.delete(lang);
      throw error;
    });

  requestMessagesPending.set(lang, fetchPromise);
  return fetchPromise;
}

export async function loadRequestMessages(request: Request) {
  const lang = await getLangFromRequest(request);

  try {
    const messages = await getCachedRequestMessages(request, lang);
    return { lang, messages };
  } catch (error) {
    if (lang === DEFAULT_LANG) {
      console.error(error);
      return { lang, messages: {} };
    }

    try {
      const messages = await getCachedRequestMessages(request, DEFAULT_LANG);
      return { lang, messages };
    } catch (fallbackError) {
      console.error(fallbackError);
      return { lang, messages: {} };
    }
  }
}
