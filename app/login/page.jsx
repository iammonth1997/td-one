"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useLanguage } from "@/app/context/LanguageContext";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import { writeStoredSession } from "@/lib/clientSession";

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
        else if (data.error === "TEMP_PIN_EXPIRED") setError(L.errTempPinExpired || L.errGeneral);
        else if (data.error === "ACCOUNT_BLOCKED") setError(`${L.errBlocked} (${data.reason})`);
        else if (data.error === "ACCOUNT_LOCKED") setError(L.errAccountLocked.replace("{minutes}", data.minutes_remaining || 15));
        else setError(L.errGeneral);
        return;
      }

      writeStoredSession({
        emp_id: empId,
        role: data.role,
        status: data.status,
        login_context: data.login_context || "employee_portal",
        login_time: new Date().toISOString(),
        session_token: data.session_token,
        must_change_pin: Boolean(data.must_change_pin),
      });

      if (data.must_change_pin) router.push("/change-pin");
      else router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleLogin();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm rounded-[1rem] border border-[#FECACA] bg-white p-8 shadow-[0_12px_36px_rgba(220,38,38,0.15)]">

        <div className="flex justify-end mb-4">
          <LanguageSwitcher />
        </div>

        <div className="flex justify-center mb-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#DC2626] shadow-[0_10px_24px_rgba(220,38,38,0.28)]">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
          </div>
        </div>

        <h1 className="mb-6 text-center text-2xl font-bold text-[#111111]">
          {L.title}
        </h1>

        <label className="text-sm font-medium text-[#555555]">{L.empIdLabel}</label>
        <input
          type="text"
          value={empId}
          onChange={(e) => setEmpId(e.target.value)}
          onKeyDown={handleKeyDown}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-2.5 text-[#111111] placeholder:text-[#777777] focus:outline-none focus:border-[#DC2626] focus:ring-1 focus:ring-[#DC2626]"
          placeholder={L.empIdPlaceholder}
          disabled={loading}
        />

        <label className="text-sm font-medium text-[#555555]">{L.pinLabel}</label>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={handleKeyDown}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-2.5 text-[#111111] placeholder:text-[#777777] focus:outline-none focus:border-[#DC2626] focus:ring-1 focus:ring-[#DC2626]"
          placeholder={L.pinPlaceholder}
          disabled={loading}
        />

        {error && (
          <p className="text-red-500 text-sm mb-3 text-center">{error}</p>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="mt-2 w-full rounded-xl bg-[#DC2626] py-2.5 font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.25)] transition hover:bg-[#991B1B] disabled:opacity-50"
        >
          {loading ? L.loadingBtn : L.loginBtn}
        </button>

        {pinSet !== true && (
          <p className="mt-4 text-center text-xs text-[#555555]">
            {L.noPin}{" "}
            <Link href="/set-pin" className="font-medium text-[#F59E0B] hover:text-[#FCD34D]">
              {L.setPinLink}
            </Link>
          </p>
        )}

        <p className={`text-center text-xs text-[#555555] ${pinSet !== true ? "mt-2" : "mt-4"}`}>
          {L.forgotPin} {L.forgotPinLink}
        </p>

        <p className="mt-2 text-center text-xs text-[#777777]">
          {L.footer}
        </p>
      </div>
    </div>
  );
}
