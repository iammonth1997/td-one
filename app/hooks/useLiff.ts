"use client";

import { useEffect, useState } from "react";
import { getLiffProfile, type LiffProfile } from "@/lib/liff";

type UseLiffResult = {
  loading: boolean;
  error: string;
  profile: LiffProfile | null;
  idToken: string;
};

export function useLiff(): UseLiffResult {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<LiffProfile | null>(null);
  const [idToken, setIdToken] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      try {
        const payload = await getLiffProfile();
        if (!cancelled) {
          setProfile(payload?.profile || null);
          setIdToken(payload?.idToken || "");
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to initialize LIFF");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  return { loading, error, profile, idToken };
}
