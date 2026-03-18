"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";

type LiffProfile = {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  statusMessage?: string;
};

function loadLiffSdk() {
  return new Promise<void>((resolve, reject) => {
    if (window.liff) {
      resolve();
      return;
    }

    const existing = document.querySelector('script[data-sdk="line-liff"]') as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load LIFF SDK")));
      return;
    }

    const script = document.createElement("script");
    script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    script.async = true;
    script.dataset.sdk = "line-liff";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load LIFF SDK"));
    document.head.appendChild(script);
  });
}

export default function LiffPage() {
  const liffId = process.env.NEXT_PUBLIC_LIFF_ID || "";
  const appBaseUrl = process.env.NEXT_PUBLIC_APP_BASE_URL || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [profile, setProfile] = useState<LiffProfile | null>(null);

  const dashboardUrl = useMemo(() => {
    if (!appBaseUrl) return "/dashboard";
    return `${appBaseUrl.replace(/\/$/, "")}/dashboard`;
  }, [appBaseUrl]);

  useEffect(() => {
    let cancelled = false;

    async function bootLiff() {
      if (!liffId) {
        setError("Missing NEXT_PUBLIC_LIFF_ID");
        setLoading(false);
        return;
      }

      try {
        await loadLiffSdk();
        const liff = window.liff;
        if (!liff) throw new Error("LIFF SDK not available");

        await liff.init({ liffId });

        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }

        const p = await liff.getProfile();
        if (!cancelled) {
          setProfile(p);
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "LIFF initialization failed");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    bootLiff();

    return () => {
      cancelled = true;
    };
  }, [liffId]);

  return (
    <main className="min-h-screen bg-white p-6 text-[#111111]">
      <div className="mx-auto max-w-lg rounded-[1rem] border border-[#FECACA] bg-white p-6 shadow-[0_12px_36px_rgba(220,38,38,0.15)]">
        <h1 className="text-2xl font-semibold">LINE LIFF</h1>
        <p className="mt-2 text-sm text-[#555555]">Connection status between LINE app and TD One ERP.</p>

        {loading ? <p className="mt-4 text-sm">Initializing LIFF...</p> : null}

        {!loading && error ? (
          <div className="mt-4 rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-3 text-sm text-[#B91C1C]">
            {error}
          </div>
        ) : null}

        {!loading && !error && profile ? (
          <div className="mt-5 space-y-3 text-sm">
            <div>
              <p className="text-[#555555]">Display name</p>
              <p className="font-medium">{profile.displayName}</p>
            </div>
            <div>
              <p className="text-[#555555]">LINE User ID</p>
              <p className="font-mono break-all">{profile.userId}</p>
            </div>
            {profile.pictureUrl ? (
              <Image
                src={profile.pictureUrl}
                alt="LINE profile"
                width={64}
                height={64}
                className="h-16 w-16 rounded-full border border-[#FECACA]"
              />
            ) : null}

            <button
              className="mt-2 rounded-xl bg-[#DC2626] px-4 py-2 text-white shadow-[0_10px_24px_rgba(220,38,38,0.24)] transition hover:bg-[#991B1B]"
              onClick={() => {
                const liff = window.liff;
                if (!liff) return;
                liff.openWindow({ url: dashboardUrl, external: true });
              }}
            >
              Open Dashboard
            </button>
          </div>
        ) : null}
      </div>
    </main>
  );
}
