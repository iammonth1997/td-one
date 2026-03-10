"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/app/context/LanguageContext";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import { useSession } from "@/app/hooks/useSession";

const RESET_ALLOWED_ROLES = new Set(["hr_payroll", "hr-payroll", "hr payroll", "hrpayroll"]);

function canResetPin(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return RESET_ALLOWED_ROLES.has(normalized);
}

export default function ForgotPinPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const L = t.forgotPin;
  const { session, loading: sessionLoading, getAuthHeaders } = useSession();

  const [empId, setEmpId] = useState("");
  const [startMonth, setStartMonth] = useState("");
  const [startYear, setStartYear] = useState("");
  const [dob, setDob] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const currentYear = new Date().getFullYear();
  const years = [];
  for (let y = currentYear; y >= currentYear - 30; y--) {
    years.push(y);
  }

  async function handleVerify() {
    if (loading) return;
    setError("");

    if (!empId.trim() || !startMonth || !startYear || !dob) {
      setError(L.errGeneral);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/login/forgot-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          emp_id: empId,
          start_month: Number(startMonth),
          start_year: Number(startYear),
          date_of_birth: dob,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "EMPLOYEE_NOT_FOUND") setError(L.errNotFound);
        else if (data.error === "INVALID_DOB") setError(L.errInvalidDob);
        else if (data.error === "INVALID_START_DATE") setError(L.errInvalidStartDate);
        else if (data.error === "ACCOUNT_BLOCKED") setError(L.errBlocked);
        else if (data.error === "USER_NOT_REGISTERED") setError(L.errNotRegistered);
        else if (data.error === "FORBIDDEN") setError(L.errForbidden);
        else setError(L.errGeneral);
        return;
      }

      router.push(`/reset-pin?token=${encodeURIComponent(data.token)}`);
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
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center text-[#1A2B4A] mb-1">
          {L.title}
        </h1>
        <p className="text-center text-[#6B7A99] text-sm mb-6">
          {L.subtitle}
        </p>

        <label className="text-[#334260] text-sm font-medium">{L.empIdLabel}</label>
        <input
          type="text"
          value={empId}
          onChange={(e) => setEmpId(e.target.value)}
          className="w-full mt-1 mb-4 p-2.5 rounded-lg bg-[#F5F7FA] text-[#1A2B4A] border border-[#D0D8E4] focus:outline-none focus:border-[#1352A3] focus:ring-1 focus:ring-[#1352A3]"
          placeholder={L.empIdPlaceholder}
          disabled={loading}
        />

        <label className="text-[#334260] text-sm font-medium">{L.startMonthLabel}</label>
        <select
          value={startMonth}
          onChange={(e) => setStartMonth(e.target.value)}
          className="w-full mt-1 mb-4 p-2.5 rounded-lg bg-[#F5F7FA] text-[#1A2B4A] border border-[#D0D8E4] focus:outline-none focus:border-[#1352A3] focus:ring-1 focus:ring-[#1352A3]"
          disabled={loading}
        >
          <option value="">{L.startMonthLabel}</option>
          {L.months.map((m, i) => (
            <option key={i} value={i + 1}>{m}</option>
          ))}
        </select>

        <label className="text-[#334260] text-sm font-medium">{L.startYearLabel}</label>
        <select
          value={startYear}
          onChange={(e) => setStartYear(e.target.value)}
          className="w-full mt-1 mb-4 p-2.5 rounded-lg bg-[#F5F7FA] text-[#1A2B4A] border border-[#D0D8E4] focus:outline-none focus:border-[#1352A3] focus:ring-1 focus:ring-[#1352A3]"
          disabled={loading}
        >
          <option value="">{L.startYearLabel}</option>
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <label className="text-[#334260] text-sm font-medium">{L.dobLabel}</label>
        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="w-full mt-1 mb-4 p-2.5 rounded-lg bg-[#F5F7FA] text-[#1A2B4A] border border-[#D0D8E4] focus:outline-none focus:border-[#1352A3] focus:ring-1 focus:ring-[#1352A3]"
          disabled={loading}
        />

        {error && (
          <p className="text-red-500 text-sm mb-3 text-center">{error}</p>
        )}

        <button
          onClick={handleVerify}
          disabled={loading}
          className="w-full py-2.5 mt-2 bg-[#1352A3] hover:bg-[#0D3B7A] disabled:opacity-50 text-white font-semibold rounded-lg shadow transition"
        >
          {loading ? L.loadingBtn : L.verifyBtn}
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
