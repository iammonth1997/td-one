const LINE_VERIFY_ENDPOINT = "https://api.line.me/oauth2/v2.1/verify";

function getLineChannelId() {
  const explicit = process.env.LINE_LOGIN_CHANNEL_ID;
  if (explicit) return explicit;

  const liffId = process.env.NEXT_PUBLIC_LIFF_ID || "";
  const parsed = liffId.split("-")[0];
  return parsed || null;
}

export async function verifyLineIdToken({ idToken, expectedUserId }) {
  const token = String(idToken || "").trim();
  if (!token) {
    return { ok: false, error: "MISSING_LINE_ID_TOKEN" };
  }

  const clientId = getLineChannelId();
  if (!clientId) {
    return { ok: false, error: "MISSING_LINE_CHANNEL_ID" };
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
    return { ok: false, error: "LINE_ID_TOKEN_VERIFY_FAILED", detail: result };
  }

  const sub = String(result.sub || "").trim();
  if (!sub) {
    return { ok: false, error: "LINE_ID_TOKEN_MISSING_SUB" };
  }

  if (expectedUserId && sub !== expectedUserId) {
    return { ok: false, error: "LINE_USER_ID_MISMATCH" };
  }

  return {
    ok: true,
    userId: sub,
    detail: result,
  };
}
