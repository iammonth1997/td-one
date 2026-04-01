import { useEffect, useMemo, useState } from "react";

import { useI18n } from "~/lib/i18n";
import { translateRequestMessage, type RequestMessages } from "~/lib/request-translations";

export type DashboardMessages = RequestMessages;

export function useDashboardTranslation(initialMessages: DashboardMessages) {
  const { lang } = useI18n();
  const [messages, setMessages] = useState<DashboardMessages>(initialMessages);

  useEffect(() => {
    let cancelled = false;

    async function syncMessages() {
      try {
        const response = await fetch(`/locales/${lang}/dashboard.json`);
        if (!response.ok) {
          throw new Error(`Unable to load dashboard translations for ${lang}`);
        }

        const nextMessages = (await response.json()) as DashboardMessages;
        if (!cancelled) {
          setMessages(nextMessages);
        }
      } catch {
        if (!cancelled) {
          setMessages(initialMessages);
        }
      }
    }

    syncMessages().catch(() => {
      if (!cancelled) {
        setMessages(initialMessages);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [initialMessages, lang]);

  return useMemo(
    () => ({
      t: (key: string, values?: Record<string, string | number>) => translateRequestMessage(messages, key, values),
    }),
    [messages],
  );
}
