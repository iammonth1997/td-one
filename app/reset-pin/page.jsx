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
      <div className="min-h-screen flex items-center justify-center bg-[#E8F0FB]">
        <div className="text-[#6B7A99]">Loading...</div>
      </div>
    );
  }

  if (!canResetPin(session?.role)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#E8F0FB] px-4">
        <div className="w-full max-w-sm bg-white border border-[#D0D8E4] rounded-2xl p-8 shadow-[0_4px_24px_rgba(13,59,122,0.10)] text-center">
          <h1 className="text-xl font-bold text-[#1A2B4A]">{L.title}</h1>
          <p className="text-sm text-red-600 mt-3">{L.errForbidden}</p>
          <Link href="/dashboard" className="inline-block mt-5 text-[#1352A3] hover:underline font-medium">
            {L.backToLogin}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#E8F0FB]">
      <div className="w-full max-w-sm bg-white border border-[#D0D8E4] rounded-2xl p-8 shadow-[0_4px_24px_rgba(13,59,122,0.10)]">

        <div className="flex justify-end mb-4">
          <LanguageSwitcher />
        </div>

        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 bg-[#1352A3] rounded-full flex items-center justify-center shadow-[0_2px_10px_rgba(19,82,163,0.30)]">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center text-[#1A2B4A] mb-1">
          {L.title}
        </h1>
        <p className="text-center text-[#6B7A99] text-sm mb-6">
          {L.subtitle}
        </p>

        <label className="text-[#334260] text-sm font-medium">{L.pinLabel}</label>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="w-full mt-1 mb-4 p-2.5 rounded-lg bg-[#F5F7FA] text-[#1A2B4A] border border-[#D0D8E4] focus:outline-none focus:border-[#1352A3] focus:ring-1 focus:ring-[#1352A3]"
          placeholder={L.pinPlaceholder}
          disabled={loading}
        />

        <label className="text-[#334260] text-sm font-medium">{L.confirmPinLabel}</label>
        <input
          type="password"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          className="w-full mt-1 mb-4 p-2.5 rounded-lg bg-[#F5F7FA] text-[#1A2B4A] border border-[#D0D8E4] focus:outline-none focus:border-[#1352A3] focus:ring-1 focus:ring-[#1352A3]"
          placeholder={L.confirmPinPlaceholder}
          disabled={loading}
        />

        {error && <p className="text-red-500 text-sm mb-3 text-center">{error}</p>}
        {success && <p className="text-green-600 text-sm mb-3 text-center">{success}</p>}

        <button
          onClick={handleReset}
          disabled={loading}
          className="w-full py-2.5 mt-2 bg-[#1352A3] hover:bg-[#0D3B7A] disabled:opacity-50 text-white font-semibold rounded-lg shadow transition"
        >
          {loading ? L.loadingBtn : L.resetBtn}
        </button>

        <p className="text-center text-[#6B7A99] text-xs mt-4">
          <Link href="/login" className="text-[#1352A3] hover:underline font-medium">
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
      <div className="min-h-screen flex items-center justify-center bg-[#E8F0FB]">
        <div className="text-[#6B7A99]">Loading...</div>
      </div>
    }>
      <ResetPinForm />
    </Suspense>
  );
}
