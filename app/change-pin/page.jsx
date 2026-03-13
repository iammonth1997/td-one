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
      <div className="min-h-screen flex items-center justify-center bg-[#E8F0FB] text-[#6B7A99]">
        Loading...
      </div>
    );
  }

  if (!session || !session.must_change_pin) {
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#E8F0FB] px-4">
      <div className="w-full max-w-sm bg-white border border-[#D0D8E4] rounded-2xl p-8 shadow-[0_4px_24px_rgba(13,59,122,0.10)]">
        <h1 className="text-2xl font-bold text-center text-[#1A2B4A] mb-2">Set New PIN</h1>
        <p className="text-sm text-center text-[#6B7A99] mb-6">Temporary PIN was used. Please set your own PIN now.</p>

        <label className="text-[#334260] text-sm font-medium">New PIN</label>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="w-full mt-1 mb-4 p-2.5 rounded-lg bg-[#F5F7FA] text-[#1A2B4A] border border-[#D0D8E4] focus:outline-none focus:border-[#1352A3] focus:ring-1 focus:ring-[#1352A3]"
          disabled={loading}
        />

        <label className="text-[#334260] text-sm font-medium">Confirm PIN</label>
        <input
          type="password"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          className="w-full mt-1 mb-4 p-2.5 rounded-lg bg-[#F5F7FA] text-[#1A2B4A] border border-[#D0D8E4] focus:outline-none focus:border-[#1352A3] focus:ring-1 focus:ring-[#1352A3]"
          disabled={loading}
        />

        {error && <p className="text-red-500 text-sm mb-3 text-center">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="w-full py-2.5 mt-2 bg-[#1352A3] hover:bg-[#0D3B7A] disabled:opacity-50 text-white font-semibold rounded-lg shadow transition"
        >
          {loading ? "Saving..." : "Save New PIN"}
        </button>
      </div>
    </div>
  );
}
