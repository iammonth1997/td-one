import { ensureDeviceIdCookie, getOrCreateDeviceId } from "~/lib/device-id";

const STORAGE_KEY = "td-one.salary-access";

type StoredSalaryAccess = {
  token: string;
  expiresAt: number;
};

type SalaryVerifyResult =
  | { ok: true; token: string; expiresIn: number }
  | { ok: false; error: string };

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function readStoredSalaryAccess(): StoredSalaryAccess | null {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StoredSalaryAccess>;
    if (typeof parsed.token !== "string" || typeof parsed.expiresAt !== "number") {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    if (parsed.expiresAt <= Date.now()) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return {
      token: parsed.token,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    window.localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

export function getStoredSalaryAccessToken() {
  return readStoredSalaryAccess()?.token ?? null;
}

export function setStoredSalaryAccessToken(token: string, expiresInSeconds: number) {
  if (!canUseStorage()) return;

  const expiresAt = Date.now() + Math.max(expiresInSeconds - 5, 1) * 1000;
  const payload: StoredSalaryAccess = { token, expiresAt };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function clearStoredSalaryAccessToken() {
  if (!canUseStorage()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}

export function isSalaryAccessError(error?: string | null) {
  return [
    "MISSING_SALARY_TOKEN",
    "INVALID_SALARY_TOKEN",
    "SALARY_TOKEN_EXPIRED",
    "SESSION_VALIDATION_FAILED",
  ].includes(String(error || ""));
}

export async function verifySalaryAccess(password: string): Promise<SalaryVerifyResult> {
  const deviceId = getOrCreateDeviceId();
  ensureDeviceIdCookie();

  const res = await fetch("/api/salary/verify", {
    method: "POST",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "x-device-id": deviceId,
    },
    body: JSON.stringify({ password }),
  });

  const data = (await res.json().catch(() => ({}))) as {
    error?: string;
    salary_access_token?: string;
    expires_in?: number;
  };

  if (!res.ok || !data.salary_access_token || typeof data.expires_in !== "number") {
    return { ok: false, error: String(data.error || "SALARY_VERIFY_FAILED") };
  }

  setStoredSalaryAccessToken(data.salary_access_token, data.expires_in);
  return {
    ok: true,
    token: data.salary_access_token,
    expiresIn: data.expires_in,
  };
}
