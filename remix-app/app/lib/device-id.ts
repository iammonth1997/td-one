const DEVICE_ID_STORAGE_KEY = "tdone_device_id";

function buildRawDeviceFingerprint() {
  // Note: We intentionally use a simple, deterministic fingerprint and keep the final
  // value stable in localStorage so "device binding" works across reloads.
  return [
    typeof navigator !== "undefined" ? navigator.userAgent : "",
    typeof navigator !== "undefined" ? navigator.language : "",
    typeof navigator !== "undefined" ? navigator.platform : "",
    String(typeof navigator !== "undefined" ? navigator.hardwareConcurrency || "" : ""),
    String(typeof navigator !== "undefined" ? navigator.maxTouchPoints || "" : ""),
  ].join("|");
}

function hashToInt(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

export function getOrCreateDeviceId(): string {
  if (typeof window === "undefined") return "dev_unknown";

  const existing = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (existing) return existing;

  const raw = buildRawDeviceFingerprint();
  const h = hashToInt(raw);
  const id = `dev_${Math.abs(h)}_${Date.now().toString(36)}`;

  window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
  return id;
}

export function setDeviceIdCookie(deviceId: string) {
  if (typeof document === "undefined") return;

  const maxAgeSeconds = 60 * 60 * 24 * 30; // 30 days
  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";

  // Not HttpOnly by design: the app needs to read it across client navigations.
  const secureFlag = isHttps ? "; Secure" : "";
  document.cookie = `tdone_device_id=${encodeURIComponent(deviceId)}; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secureFlag}`;
}

export function ensureDeviceIdCookie(): string {
  const deviceId = getOrCreateDeviceId();
  setDeviceIdCookie(deviceId);
  return deviceId;
}

export const DEVICE_ID_STORAGE_KEY_NAME = DEVICE_ID_STORAGE_KEY;

