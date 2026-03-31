import { createCookie } from "react-router";

import {
  DEFAULT_LANG,
  LANGUAGE_COOKIE_MAX_AGE,
  LANGUAGE_COOKIE_NAME,
  parseLangCode,
} from "~/lib/i18n.shared";

export const languageCookie = createCookie(LANGUAGE_COOKIE_NAME, {
  sameSite: "lax",
  path: "/",
  secure: true,
  maxAge: LANGUAGE_COOKIE_MAX_AGE,
});

export async function getLangFromRequest(request: Request) {
  const cookieHeader = request.headers.get("Cookie");
  const parsed = await languageCookie.parse(cookieHeader);
  if (typeof parsed === "string") {
    return parseLangCode(parsed);
  }

  if (cookieHeader) {
    const match = new RegExp(`(?:^|;\\s*)${LANGUAGE_COOKIE_NAME}=([^;]+)`).exec(cookieHeader);
    if (match?.[1]) {
      return parseLangCode(decodeURIComponent(match[1]));
    }
  }

  return DEFAULT_LANG;
}
