import {
  ADMIN_PORTAL,
  EMPLOYEE_PORTAL,
  normalizeLoginContext,
} from "@/lib/sessionContext";

export const EMPLOYEE_SESSION_KEY = "tdone_employee_session";
export const ADMIN_SESSION_KEY = "tdone_admin_session";
export const LEGACY_SESSION_KEY = "tdone_session";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function getStorageKey(loginContext = EMPLOYEE_PORTAL) {
  return normalizeLoginContext(loginContext) === ADMIN_PORTAL
    ? ADMIN_SESSION_KEY
    : EMPLOYEE_SESSION_KEY;
}

function parseStoredSession(raw) {
  if (!raw) return null;

  const parsed = JSON.parse(raw);
  const loginTime = new Date(parsed.login_time).getTime();
  if (!parsed.session_token || Number.isNaN(loginTime) || Date.now() > loginTime + SESSION_DURATION_MS) {
    return null;
  }

  return {
    ...parsed,
    login_context: normalizeLoginContext(parsed.login_context),
  };
}

function safeRemove(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore storage errors
  }
}

function readFromKey(key) {
  try {
    const parsed = parseStoredSession(localStorage.getItem(key));
    if (!parsed) {
      safeRemove(key);
      return null;
    }
    return parsed;
  } catch {
    safeRemove(key);
    return null;
  }
}

function migrateLegacySession(preferredPortal) {
  const legacySession = readFromKey(LEGACY_SESSION_KEY);
  if (!legacySession) return null;

  const sessionPortal = normalizeLoginContext(legacySession.login_context);
  const targetPortal = normalizeLoginContext(preferredPortal);
  if (sessionPortal !== targetPortal) {
    return null;
  }

  writeStoredSession(legacySession);
  safeRemove(LEGACY_SESSION_KEY);
  return legacySession;
}

export function readStoredSession(loginContext = EMPLOYEE_PORTAL) {
  if (typeof window === "undefined") return null;

  const key = getStorageKey(loginContext);
  const session = readFromKey(key);
  if (session) return session;

  return migrateLegacySession(loginContext);
}

export function readAnyStoredSession() {
  if (typeof window === "undefined") return null;

  const adminSession = readStoredSession(ADMIN_PORTAL);
  if (adminSession) return adminSession;

  const employeeSession = readStoredSession(EMPLOYEE_PORTAL);
  if (employeeSession) return employeeSession;

  const legacySession = readFromKey(LEGACY_SESSION_KEY);
  if (!legacySession) return null;

  writeStoredSession(legacySession);
  safeRemove(LEGACY_SESSION_KEY);
  return legacySession;
}

export function writeStoredSession(session) {
  if (typeof window === "undefined") return;

  const normalizedSession = {
    ...session,
    login_context: normalizeLoginContext(session?.login_context),
  };

  try {
    localStorage.setItem(
      getStorageKey(normalizedSession.login_context),
      JSON.stringify(normalizedSession)
    );
    safeRemove(LEGACY_SESSION_KEY);
  } catch {
    // ignore storage errors
  }
}

export function removeStoredSession(loginContext = EMPLOYEE_PORTAL) {
  if (typeof window === "undefined") return;

  const normalizedPortal = normalizeLoginContext(loginContext);
  safeRemove(getStorageKey(normalizedPortal));

  const legacySession = readFromKey(LEGACY_SESSION_KEY);
  if (legacySession && normalizeLoginContext(legacySession.login_context) === normalizedPortal) {
    safeRemove(LEGACY_SESSION_KEY);
  }
}

export function patchStoredSession(loginContext = EMPLOYEE_PORTAL, patch = {}) {
  const current = readStoredSession(loginContext);
  if (!current) return null;

  const nextSession = { ...current, ...patch };
  writeStoredSession(nextSession);
  return nextSession;
}
