"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/app/hooks/useSession";
import { patchStoredSession } from "@/lib/clientSession";

export default function ChangePinPage() {
  const router = useRouter();
  const { session, loading: sessionLoading, getAuthHeaders } = useSession();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (sessionLoading) return;
    if (!session) return;
    if (!session.must_change_pin) {
      router.replace("/dashboard");
    }
  }, [sessionLoading, session, router]);

  async function handleSubmit() {
    if (loading) return;
    setError("");

    if (pin.length < 4) {
      setError("PIN must be at least 4 digits.");
      return;
    }

    if (pin !== confirmPin) {
      setError("PIN does not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/login/change-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ new_pin: pin }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.error === "TEMP_PIN_EXPIRED") setError("Temporary PIN expired. Please contact HR Payroll.");
        else setError("Unable to change PIN. Please try again.");
        return;
      }

      patchStoredSession("employee_portal", { must_change_pin: false });

      router.replace("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-[#555555]">
        Loading...
      </div>
    );
  }

  if (!session || !session.must_change_pin) {
    return null;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm rounded-[1rem] border border-[#FECACA] bg-white p-8 shadow-[0_4px_24px_rgba(220,38,38,0.10)]">
        <h1 className="mb-2 text-center text-2xl font-bold text-[#111111]">Set New PIN</h1>
        <p className="mb-6 text-center text-sm text-[#777777]">Temporary PIN was used. Please set your own PIN now.</p>

        <label className="text-sm font-medium text-[#555555]">New PIN</label>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:outline-none focus:border-[#DC2626] focus:ring-1 focus:ring-[#DC2626]"
          disabled={loading}
        />

        <label className="text-sm font-medium text-[#555555]">Confirm PIN</label>
        <input
          type="password"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:outline-none focus:border-[#DC2626] focus:ring-1 focus:ring-[#DC2626]"
          disabled={loading}
        />

        {error && <p className="text-red-500 text-sm mb-3 text-center">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="mt-2 w-full rounded-xl bg-[#DC2626] py-2.5 font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.25)] transition hover:bg-[#991B1B] disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save New PIN"}
        </button>
      </div>
    </div>
  );
}
