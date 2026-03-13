"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours
const CHECK_INTERVAL_MS = 60 * 1000; // check every 60 seconds

export function useSession({ loginPath = "/login", requiredPortal = null } = {}) {
  const router = useRouter();
  const [refreshTick, setRefreshTick] = useState(0);

  const checkAndGetSession = useCallback(() => {
    try {
      const raw = localStorage.getItem("tdone_session");
      if (!raw) return null;

      const parsed = JSON.parse(raw);
      const loginTime = new Date(parsed.login_time).getTime();

      if (isNaN(loginTime) || Date.now() > loginTime + SESSION_DURATION_MS) {
        localStorage.removeItem("tdone_session");
        return null;
      }

      return parsed;
    } catch {
      localStorage.removeItem("tdone_session");
      return null;
    }
  }, []);

  void refreshTick;
  const session = typeof window === "undefined" ? null : checkAndGetSession();

  useEffect(() => {
    if (!session) {
      router.push(loginPath);
    } else {
      if (requiredPortal && session.login_context !== requiredPortal) {
        router.replace(session.login_context === "admin_portal" ? "/admin" : "/dashboard");
      } else {
        if (session.must_change_pin && window.location.pathname !== "/change-pin") {
          router.replace("/change-pin");
        }
      }
    }

    const interval = setInterval(() => {
      const current = checkAndGetSession();
      if (!current) {
        router.push(loginPath);
      } else {
        setRefreshTick((value) => value + 1);
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [checkAndGetSession, loginPath, requiredPortal, router, session]);

  const getAuthHeaders = useCallback(() => {
    try {
      const raw = localStorage.getItem("tdone_session");
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      if (parsed.session_token) {
        return { Authorization: `Bearer ${parsed.session_token}` };
      }
    } catch { /* ignore */ }
    return {};
  }, []);

  const logout = useCallback(async () => {
    try {
      const raw = localStorage.getItem("tdone_session");
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.session_token) {
          fetch("/api/login/logout", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${parsed.session_token}`,
            },
          }).catch(() => {});
        }
      }
    } catch { /* ignore */ }
    localStorage.removeItem("tdone_session");
    setRefreshTick((value) => value + 1);
    router.push(loginPath);
  }, [loginPath, router]);

  return {
    session,
    loading: false,
    logout,
    getAuthHeaders,
  };
}
