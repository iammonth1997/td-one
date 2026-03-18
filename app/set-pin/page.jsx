"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/app/context/LanguageContext";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";

export default function SetPinPage() {
  const router = useRouter();
  const [empId, setEmpId] = useState("");
  const [dob, setDob] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const { t } = useLanguage();
  const L = t.setPin;

  async function handleSetPin() {
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

    setLoading(true);

    try {
      const res = await fetch("/api/login/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emp_id: empId, date_of_birth: dob, pin }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "EMPLOYEE_NOT_FOUND") setError(L.errNotFound);
        else if (data.error === "INVALID_DOB") setError(L.errInvalidDob);
        else if (data.error === "ACCOUNT_BLOCKED") setError(L.errBlocked);
        else setError(data.error || L.errGeneral);
        return;
      }

      setSuccess(L.successMsg);
      setTimeout(() => router.push("/login"), 1500);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm rounded-[1rem] border border-[#FECACA] bg-white p-8 shadow-[0_4px_24px_rgba(220,38,38,0.10)]">

        <div className="flex justify-end mb-4">
          <LanguageSwitcher />
        </div>

        <h1 className="mb-6 text-center text-2xl font-bold text-[#111111]">
          {L.title}
        </h1>

        <label className="text-sm font-medium text-[#555555]">{L.empIdLabel}</label>
        <input
          type="text"
          value={empId}
          onChange={(e) => setEmpId(e.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:outline-none focus:border-[#DC2626] focus:ring-1 focus:ring-[#DC2626]"
          placeholder={L.empIdPlaceholder}
          disabled={loading}
        />

        <label className="text-sm font-medium text-[#555555]">{L.dobLabel}</label>
        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] focus:outline-none focus:border-[#DC2626] focus:ring-1 focus:ring-[#DC2626]"
          disabled={loading}
        />

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
          onClick={handleSetPin}
          disabled={loading}
          className="mt-2 w-full rounded-xl bg-[#DC2626] py-2.5 font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.25)] transition hover:bg-[#991B1B] disabled:opacity-50"
        >
          {loading ? L.loadingBtn : L.setPinBtn}
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
