"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000; // 8 hours
const CHECK_INTERVAL_MS = 60 * 1000; // check every 60 seconds

export function useSession() {
  const router = useRouter();
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    const s = checkAndGetSession();
    if (!s) {
      router.push("/login");
    } else {
      setSession(s);
    }
    setLoading(false);

    const interval = setInterval(() => {
      const current = checkAndGetSession();
      if (!current) {
        setSession(null);
        router.push("/login");
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [checkAndGetSession, router]);

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
    setSession(null);
    router.push("/login");
  }, [router]);

  return { session, loading, logout, getAuthHeaders };
}
