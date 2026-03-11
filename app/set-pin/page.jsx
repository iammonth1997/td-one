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
    <div className="min-h-screen flex items-center justify-center bg-[#E8F0FB]">
      <div className="w-full max-w-sm bg-white border border-[#D0D8E4] rounded-2xl p-8 shadow-[0_4px_24px_rgba(13,59,122,0.10)]">

        <div className="flex justify-end mb-4">
          <LanguageSwitcher />
        </div>

        <h1 className="text-2xl font-bold text-center text-[#1A2B4A] mb-6">
          {L.title}
        </h1>

        <label className="text-[#334260] text-sm font-medium">{L.empIdLabel}</label>
        <input
          type="text"
          value={empId}
          onChange={(e) => setEmpId(e.target.value)}
          className="w-full mt-1 mb-4 p-2.5 rounded-lg bg-[#F5F7FA] text-[#1A2B4A] border border-[#D0D8E4] focus:outline-none focus:border-[#1352A3] focus:ring-1 focus:ring-[#1352A3]"
          placeholder={L.empIdPlaceholder}
          disabled={loading}
        />

        <label className="text-[#334260] text-sm font-medium">{L.dobLabel}</label>
        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="w-full mt-1 mb-4 p-2.5 rounded-lg bg-[#F5F7FA] text-[#1A2B4A] border border-[#D0D8E4] focus:outline-none focus:border-[#1352A3] focus:ring-1 focus:ring-[#1352A3]"
          disabled={loading}
        />

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
          onClick={handleSetPin}
          disabled={loading}
          className="w-full py-2.5 mt-2 bg-[#1352A3] hover:bg-[#0D3B7A] disabled:opacity-50 text-white font-semibold rounded-lg shadow transition"
        >
          {loading ? L.loadingBtn : L.setPinBtn}
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
