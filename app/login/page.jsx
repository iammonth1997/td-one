"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/app/context/LanguageContext";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";

export default function LoginPage() {
  const [empId, setEmpId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pinSet, setPinSet] = useState(null);
  const router = useRouter();
  const { t } = useLanguage();
  const L = t.login;

  async function handleLogin() {
    if (loading) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emp_id: empId, pin }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "USER_NOT_FOUND") setError(L.errNotFound);
        else if (data.error === "EMPLOYEE_NOT_FOUND") setError(L.errEmployeeNotFound);
        else if (data.error === "INVALID_PIN") { setPinSet(true); setError(L.errInvalidPin); }
        else if (data.error === "PIN_NOT_SET") { setPinSet(false); setError(L.errPinNotSet); }
        else if (data.error === "ACCOUNT_BLOCKED") setError(`${L.errBlocked} (${data.reason})`);
        else if (data.error === "ACCOUNT_LOCKED") setError(L.errAccountLocked.replace("{minutes}", data.minutes_remaining || 15));
        else setError(L.errGeneral);
        return;
      }

      localStorage.setItem(
        "tdone_session",
        JSON.stringify({
          emp_id: empId,
          role: data.role,
          status: data.status,
          login_time: new Date().toISOString(),
          session_token: data.session_token,
        })
      );

      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleLogin();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#E8F0FB]">
      <div className="w-full max-w-sm bg-white border border-[#D0D8E4] rounded-2xl p-8 shadow-[0_4px_24px_rgba(13,59,122,0.10)]">

        <div className="flex justify-end mb-4">
          <LanguageSwitcher />
        </div>

        <div className="flex justify-center mb-4">
          <div className="w-14 h-14 bg-[#1352A3] rounded-full flex items-center justify-center shadow-[0_2px_10px_rgba(19,82,163,0.30)]">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-center text-[#1A2B4A] mb-6">
          {L.title}
        </h1>

        <label className="text-[#334260] text-sm font-medium">{L.empIdLabel}</label>
        <input
          type="text"
          value={empId}
          onChange={(e) => setEmpId(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full mt-1 mb-4 p-2.5 rounded-lg bg-[#F5F7FA] text-[#1A2B4A] border border-[#D0D8E4] focus:outline-none focus:border-[#1352A3] focus:ring-1 focus:ring-[#1352A3]"
          placeholder={L.empIdPlaceholder}
          disabled={loading}
        />

        <label className="text-[#334260] text-sm font-medium">{L.pinLabel}</label>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full mt-1 mb-4 p-2.5 rounded-lg bg-[#F5F7FA] text-[#1A2B4A] border border-[#D0D8E4] focus:outline-none focus:border-[#1352A3] focus:ring-1 focus:ring-[#1352A3]"
          placeholder={L.pinPlaceholder}
          disabled={loading}
        />

        {error && (
          <p className="text-red-500 text-sm mb-3 text-center">{error}</p>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full py-2.5 mt-2 bg-[#1352A3] hover:bg-[#0D3B7A] disabled:opacity-50 text-white font-semibold rounded-lg shadow transition"
        >
          {loading ? L.loadingBtn : L.loginBtn}
        </button>

        {pinSet !== true && (
          <p className="text-center text-[#6B7A99] text-xs mt-4">
            {L.noPin}{" "}
            <Link href="/set-pin" className="text-[#1352A3] hover:underline font-medium">
              {L.setPinLink}
            </Link>
          </p>
        )}

        <p className={`text-center text-[#6B7A99] text-xs ${pinSet !== true ? "mt-2" : "mt-4"}`}>
          {L.forgotPin} {L.forgotPinLink}
        </p>

        <p className="text-center text-[#6B7A99] text-xs mt-2">
          {L.footer}
        </p>
      </div>
    </div>
  );
}
