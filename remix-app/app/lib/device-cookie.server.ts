import { createCookie } from "react-router";

const DEVICE_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

export const deviceIdCookie = createCookie("tdone_device_id", {
  httpOnly: false,
  sameSite: "lax",
  path: "/",
  secure: true,
  maxAge: DEVICE_COOKIE_MAX_AGE,
});

export async function getDeviceIdFromRequest(request: Request) {
  const headerDeviceId = request.headers.get("x-device-id")?.trim();
  if (headerDeviceId) return headerDeviceId;

  const cookieHeader = request.headers.get("Cookie");

  // React Router createCookie.parse() expects JSON-encoded values (set by server).
  // Try that first (for server-side Set-Cookie responses after login).
  try {
    const parsed = await deviceIdCookie.parse(cookieHeader);
    if (typeof parsed === "string" && parsed.trim()) return parsed.trim();
  } catch {
    // ignore JSON parse error from plain-string client cookies
  }

  // Fallback: read raw cookie value set by client-side JS (plain string, URL-encoded).
  if (cookieHeader) {
    const match = /(?:^|;\s*)tdone_device_id=([^;]+)/.exec(cookieHeader);
    if (match?.[1]) {
      const raw = decodeURIComponent(match[1]).trim();
      if (raw) return raw;
    }
  }

  return null;
}

