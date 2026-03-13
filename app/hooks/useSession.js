"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { readStoredSession, removeStoredSession } from "@/lib/clientSession";
import { EMPLOYEE_PORTAL } from "@/lib/sessionContext";

const CHECK_INTERVAL_MS = 60 * 1000; // check every 60 seconds

export function useSession({ loginPath = "/login", requiredPortal = null } = {}) {
  const router = useRouter();
  const [refreshTick, setRefreshTick] = useState(0);
  const portal = requiredPortal || EMPLOYEE_PORTAL;

  const checkAndGetSession = useCallback(() => {
    return readStoredSession(portal);
  }, [portal]);

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
    const current = readStoredSession(portal);
    if (current?.session_token) {
      return { Authorization: `Bearer ${current.session_token}` };
    }
    return {};
  }, [portal]);

  const logout = useCallback(async () => {
    try {
      const current = readStoredSession(portal);
      if (current?.session_token) {
          fetch("/api/login/logout", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${current.session_token}`,
            },
          }).catch(() => {});
      }
    } catch { /* ignore */ }
    removeStoredSession(portal);
    setRefreshTick((value) => value + 1);
    router.push(loginPath);
  }, [loginPath, portal, router]);

  return {
    session,
    loading: false,
    logout,
    getAuthHeaders,
  };
}
