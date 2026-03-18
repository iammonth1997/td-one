import { useState } from "react";
import { redirect, useNavigate } from "react-router";
import type { Route } from "./+types/change-pin";
import { getSupabaseServerClient } from "~/lib/supabase.server";
import { validateSession } from "~/lib/session-validation.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { session, error, status } = await validateSession(request, context);
  if (error || !session) {
    throw redirect("/login");
  }

  const { supabaseServer } = getSupabaseServerClient(context);
  const { data: user } = await supabaseServer
    .from("login_users")
    .select("force_pin_change")
    .eq("emp_id", session.emp_id)
    .maybeSingle();

  if (!user?.force_pin_change) {
    throw redirect("/dashboard");
  }

  return { empId: session.emp_id };
}

export default function ChangePinPage() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

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
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ new_pin: pin }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        if (data.error === "TEMP_PIN_EXPIRED") setError("Temporary PIN expired. Please contact HR Payroll.");
        else if (data.error === "MISSING_SESSION_TOKEN") navigate("/login");
        else setError("Unable to change PIN. Please try again.");
        return;
      }

      navigate("/dashboard", { replace: true });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm rounded-[1rem] border border-[#FECACA] bg-white p-8 shadow-[0_4px_24px_rgba(220,38,38,0.10)]">
        <h1 className="mb-2 text-center text-2xl font-bold text-[#111111]">Set New PIN</h1>
        <p className="mb-6 text-center text-sm text-[#777777]">
          Temporary PIN was used. Please set your own PIN now.
        </p>

        <label className="text-sm font-medium text-[#555555]">New PIN</label>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          disabled={loading}
        />

        <label className="text-sm font-medium text-[#555555]">Confirm PIN</label>
        <input
          type="password"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          disabled={loading}
        />

        {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={loading}
          className="mt-2 w-full rounded-xl bg-[#DC2626] py-2.5 font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.25)] transition hover:bg-[#991B1B] disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save New PIN"}
        </button>
      </div>
    </div>
  );
}
