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
    <main className="min-h-screen bg-[#F5F7FA] text-[#1A2B4A] p-6">
      <div className="mx-auto max-w-lg rounded-2xl bg-white border border-[#DDE3EA] p-6 shadow-sm">
        <h1 className="text-2xl font-semibold">LINE LIFF</h1>
        <p className="mt-2 text-sm text-[#4E5E7A]">Connection status between LINE app and TD One ERP.</p>

        {loading ? <p className="mt-4 text-sm">Initializing LIFF...</p> : null}

        {!loading && error ? (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        {!loading && !error && profile ? (
          <div className="mt-5 space-y-3 text-sm">
            <div>
              <p className="text-[#4E5E7A]">Display name</p>
              <p className="font-medium">{profile.displayName}</p>
            </div>
            <div>
              <p className="text-[#4E5E7A]">LINE User ID</p>
              <p className="font-mono break-all">{profile.userId}</p>
            </div>
            {profile.pictureUrl ? (
              <Image
                src={profile.pictureUrl}
                alt="LINE profile"
                width={64}
                height={64}
                className="h-16 w-16 rounded-full border border-[#DDE3EA]"
              />
            ) : null}

            <button
              className="mt-2 rounded-lg bg-[#1352A3] px-4 py-2 text-white hover:bg-[#0F4487]"
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
