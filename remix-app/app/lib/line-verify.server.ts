import { getEnvValue } from "~/lib/env.server";

const LINE_VERIFY_ENDPOINT = "https://api.line.me/oauth2/v2.1/verify";

function getLineChannelId(context: unknown) {
  const explicit = getEnvValue(context, "LINE_LOGIN_CHANNEL_ID");
  if (explicit) return explicit;

  const liffId = getEnvValue(context, "NEXT_PUBLIC_LIFF_ID") || "";
  const parsed = liffId.split("-")[0];
  return parsed || null;
}

export async function verifyLineIdToken({
  context,
  idToken,
  expectedUserId,
}: {
  context: unknown;
  idToken: string;
  expectedUserId?: string;
}) {
  const token = String(idToken || "").trim();
  if (!token) {
    return { ok: false, error: "MISSING_LINE_ID_TOKEN" } as const;
  }

  const clientId = getLineChannelId(context);
  if (!clientId) {
    return { ok: false, error: "MISSING_LINE_CHANNEL_ID" } as const;
  }

  const body = new URLSearchParams({
    id_token: token,
    client_id: clientId,
  });

  const res = await fetch(LINE_VERIFY_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });

  const result = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: "LINE_ID_TOKEN_VERIFY_FAILED", detail: result } as const;
  }

  const sub = String((result as { sub?: string }).sub || "").trim();
  if (!sub) {
    return { ok: false, error: "LINE_ID_TOKEN_MISSING_SUB" } as const;
  }

  if (expectedUserId && sub !== expectedUserId) {
    return { ok: false, error: "LINE_USER_ID_MISMATCH" } as const;
  }

  return {
    ok: true,
    userId: sub,
    detail: result,
  } as const;
}
