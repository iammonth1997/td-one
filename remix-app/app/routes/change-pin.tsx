import { useState } from "react";
import { redirect, useNavigate } from "react-router";
import type { Route } from "./+types/change-pin";
import { getSupabaseServerClient } from "~/lib/supabase.server";
import { validateSession } from "~/lib/session-validation.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { session, error } = await validateSession(request, context);
  if (error || !session) {
    throw redirect("/login");
  }

  const { supabaseServer } = getSupabaseServerClient(context);
  const { data: user } = await supabaseServer
    .from("login_users")
    .select("force_pin_change")
    .eq("emp_id", session.emp_id)
    .maybeSingle();

  return { empId: session.emp_id, mustChangePin: Boolean(user?.force_pin_change) };
}

export default function ChangePinPage({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const [currentPin, setCurrentPin] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (loading) return;
    setError("");

    if (!/^\d{6}$/.test(pin)) {
      setError("New PIN must be exactly 6 digits.");
      return;
    }

    if (pin !== confirmPin) {
      setError("Password does not match.");
      return;
    }

    if (!loaderData.mustChangePin && currentPin.length < 1) {
      setError("Current password is required.");
      return;
    }

    if (pin.length < 12) {
      setError("New password must be at least 12 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/login/change-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_pin: currentPin, new_pin: pin }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        if (data.error === "TEMP_PIN_EXPIRED") setError("Temporary password expired. Please contact HR.");
        else if (data.error === "INVALID_CURRENT_PIN") setError("Current password is incorrect.");
        else if (data.error === "INVALID_PIN_FORMAT") setError("New password must be 12-128 characters.");
        else if (data.error === "PASSWORD_SAME_AS_PREVIOUS") setError("New password cannot be the same as recent passwords.");
        else if (data.error === "MISSING_SESSION_TOKEN") navigate("/login");
        else setError("Unable to change password. Please try again.");
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
        <h1 className="mb-2 text-center text-2xl font-bold text-[#111111]">{loaderData.mustChangePin ? "Set New Password" : "Change Password"}</h1>
        <p className="mb-6 text-center text-sm text-[#777777]">
          {loaderData.mustChangePin
            ? "Please set your own password now."
            : "Enter your current password and choose a new password."}
        </p>

        {!loaderData.mustChangePin ? (
          <>
            <label className="text-sm font-medium text-[#555555]">Current Password</label>
            <input
              type="password"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
              disabled={loading}
            />
          </>
        ) : null}

        <label className="text-sm font-medium text-[#555555]">New Password</label>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          placeholder="12+ characters"
          disabled={loading}
        />
        <p className="mb-3 text-xs text-[#666666]">Min 12 characters. Use mix of letters, numbers, symbols.</p>

        <label className="text-sm font-medium text-[#555555]">Confirm Password</label>
        <input
          type="password"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          placeholder="Confirm password"
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
          {loading ? "Saving..." : "Save Password"}
        </button>
      </div>
    </div>
  );
}
