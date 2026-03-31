import { useEffect, useMemo, useState } from "react";

import { useI18n } from "~/lib/i18n";
export type RequestMessages = Record<string, unknown>;

function getNestedValue(messages: RequestMessages, key: string): unknown {
  return key.split(".").reduce<unknown>((current, part) => {
    if (!current || typeof current !== "object" || !(part in current)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[part];
  }, messages);
}

function interpolateMessage(template: string, values?: Record<string, string | number>) {
  if (!values) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key) => {
    const value = values[key];
    return value == null ? "" : String(value);
  });
}

export function translateRequestMessage(
  messages: RequestMessages,
  key: string,
  values?: Record<string, string | number>,
) {
  const resolved = getNestedValue(messages, key);
  if (typeof resolved !== "string") {
    return key;
  }

  return interpolateMessage(resolved, values);
}

export function useRequestTranslation(initialMessages: RequestMessages) {
  const { lang } = useI18n();
  const [messages, setMessages] = useState<RequestMessages>(initialMessages);

  useEffect(() => {
    let cancelled = false;

    async function syncMessages() {
      try {
        const response = await fetch(`/locales/${lang}/requests.json`);
        if (!response.ok) {
          throw new Error(`Unable to load request translations for ${lang}`);
        }

        const nextMessages = (await response.json()) as RequestMessages;
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
