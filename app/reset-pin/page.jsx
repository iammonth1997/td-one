"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/app/context/LanguageContext";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import { useSession } from "@/app/hooks/useSession";

const RESET_ALLOWED_ROLES = new Set(["hr_payroll", "hr-payroll", "hr payroll", "hrpayroll"]);

function canResetPin(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return RESET_ALLOWED_ROLES.has(normalized);
}

function ResetPinForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const { t } = useLanguage();
  const L = t.resetPin;
  const { session, loading: sessionLoading, getAuthHeaders } = useSession();

  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleReset() {
    if (loading) return;
    setError("");
    setSuccess("");

    if (pin.length < 4) {
      setError(L.errPinLength);
      return;
    }

    if (pin !== confirmPin) {
      setError(L.errPinMismatch);
      return;
    }

    if (!token) {
      setError(L.errTokenExpired);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/login/reset-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ token, new_pin: pin }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "INVALID_OR_EXPIRED_TOKEN") setError(L.errTokenExpired);
        else if (data.error === "FORBIDDEN") setError(L.errForbidden);
        else setError(L.errGeneral);
        return;
      }

      setSuccess(L.successMsg);
      setTimeout(() => router.push("/login"), 1500);
    } finally {
      setLoading(false);
    }
  }

  if (sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-[#555555]">Loading...</div>
      </div>
    );
  }

  if (!canResetPin(session?.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="w-full max-w-sm rounded-[1rem] border border-[#FECACA] bg-white p-8 text-center shadow-[0_4px_24px_rgba(220,38,38,0.10)]">
          <h1 className="text-xl font-bold text-[#111111]">{L.title}</h1>
          <p className="mt-3 text-sm text-[#FCA5A5]">{L.errForbidden}</p>
          <Link href="/dashboard" className="mt-5 inline-block font-medium text-[#DC2626] transition hover:text-[#991B1B]">
            {L.backToLogin}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm rounded-[1rem] border border-[#FECACA] bg-white p-8 shadow-[0_4px_24px_rgba(220,38,38,0.10)]">

        <div className="flex justify-end mb-4">
          <LanguageSwitcher />
        </div>

        <div className="flex justify-center mb-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#DC2626] shadow-[0_10px_24px_rgba(220,38,38,0.28)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
        </div>

        <h1 className="mb-1 text-center text-2xl font-bold text-[#111111]">
          {L.title}
        </h1>
        <p className="mb-6 text-center text-sm text-[#777777]">
          {L.subtitle}
        </p>

        <label className="text-sm font-medium text-[#555555]">{L.pinLabel}</label>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:outline-none focus:border-[#DC2626] focus:ring-1 focus:ring-[#DC2626]"
          placeholder={L.pinPlaceholder}
          disabled={loading}
        />

        <label className="text-sm font-medium text-[#555555]">{L.confirmPinLabel}</label>
        <input
          type="password"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:outline-none focus:border-[#DC2626] focus:ring-1 focus:ring-[#DC2626]"
          placeholder={L.confirmPinPlaceholder}
          disabled={loading}
        />

        {error && <p className="mb-3 text-center text-sm text-[#FCA5A5]">{error}</p>}
        {success && <p className="mb-3 text-center text-sm text-[#86EFAC]">{success}</p>}

        <button
          onClick={handleReset}
          disabled={loading}
          className="mt-2 w-full rounded-xl bg-[#DC2626] py-2.5 font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.25)] transition hover:bg-[#991B1B] disabled:opacity-50"
        >
          {loading ? L.loadingBtn : L.resetBtn}
        </button>

        <p className="mt-4 text-center text-xs text-[#555555]">
          <Link href="/login" className="font-medium text-[#DC2626] transition hover:text-[#991B1B]">
            {L.backToLogin}
          </Link>
        </p>

      </div>
    </div>
  );
}

export default function ResetPinPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-[#555555]">Loading...</div>
      </div>
    }>
      <ResetPinForm />
    </Suspense>
  );
}
