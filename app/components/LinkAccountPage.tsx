"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import type { LiffProfile } from "@/lib/liff";
import { writeStoredSession } from "@/lib/clientSession";

type Props = {
  profile: LiffProfile;
  idToken: string;
};

export default function LinkAccountPage({ profile, idToken }: Props) {
  const router = useRouter();
  const [empId, setEmpId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (loading) return;

    const normalizedEmpId = empId.trim().toUpperCase();
    const normalizedPin = pin.trim();
    if (!normalizedEmpId || normalizedPin.length !== 6) {
      setError("Please enter employee code and 6-digit PIN");
      return;
    }

    if (!idToken) {
      setError("Missing LIFF token. Please reopen from LINE.");
      return;
    }

    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/verify-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emp_id: normalizedEmpId,
          pin: normalizedPin,
          line_user_id: profile.userId,
          id_token: idToken,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        if (data.error === "INVALID_PIN") setError("Invalid PIN");
        else if (data.error === "USER_NOT_FOUND") setError("Employee login not found");
        else if (data.error === "LINE_ALREADY_LINKED") setError("This LINE account is linked to another employee");
        else if (data.error === "LINE_USER_ID_MISMATCH") setError("LINE token mismatch. Please login from LINE again");
        else if (data.error === "ACCOUNT_BLOCKED") setError(`Account blocked (${data.reason || "unknown"})`);
        else setError("Unable to link account");
        return;
      }

      writeStoredSession({
        emp_id: data.emp_id,
        role: data.role,
        status: data.status,
        login_context: data.login_context || "employee_portal",
        login_time: new Date().toISOString(),
        session_token: data.session_token,
        must_change_pin: Boolean(data.must_change_pin),
      });

      if (data.must_change_pin) router.replace("/change-pin");
      else router.replace("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-white p-4">
      <div className="w-full max-w-md rounded-[1rem] border border-[#FECACA] bg-white p-7 shadow-[0_12px_36px_rgba(220,38,38,0.15)]">
        <div className="text-center">
          {profile.pictureUrl ? (
            <Image
              src={profile.pictureUrl}
              alt="LINE profile"
              width={72}
              height={72}
              className="mx-auto rounded-full border border-[#333333]"
            />
          ) : (
            <div className="mx-auto h-[72px] w-[72px] rounded-full border border-[#333333] bg-white" />
          )}
          <h1 className="mt-3 text-xl font-bold text-[#111111]">Link LINE Account</h1>
          <p className="mt-1 text-sm text-[#555555]">Signed in as {profile.displayName}</p>
        </div>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="text-sm font-medium text-[#555555]">Employee Code</label>
            <input
              value={empId}
              onChange={(e) => setEmpId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:outline-none focus:border-[#DC2626] focus:ring-1 focus:ring-[#DC2626]"
              placeholder="L2211018"
              disabled={loading}
            />
          </div>

          <div>
            <label className="text-sm font-medium text-[#555555]">6-digit PIN</label>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:outline-none focus:border-[#DC2626] focus:ring-1 focus:ring-[#DC2626]"
              placeholder="******"
              type="password"
              inputMode="numeric"
              disabled={loading}
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-[#DC2626] py-2.5 font-semibold text-white transition hover:bg-[#991B1B] disabled:opacity-60 shadow-[0_10px_24px_rgba(220,38,38,0.25)]"
          >
            {loading ? "Verifying..." : "Verify PIN and Link"}
          </button>
        </form>
      </div>
    </div>
  );
}
