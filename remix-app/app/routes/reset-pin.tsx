import { useMemo, useState } from "react";
import { Link, redirect, useNavigate } from "react-router";
import type { Route } from "./+types/reset-pin";
import { canManagePinReset } from "~/lib/role-access.server";
import { validateSession } from "~/lib/session-validation.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { session, error } = await validateSession(request, context);
  if (error || !session) {
    throw redirect("/login");
  }

  if (!canManagePinReset(session.role)) {
    throw redirect("/dashboard");
  }

  return { role: session.role };
}

export default function ResetPinPage() {
  const navigate = useNavigate();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  const token = useMemo(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    return params.get("token") || "";
  }, []);

  async function handleReset() {
    if (loading) return;
    setError("");
    setSuccess("");

    if (pin.length < 4) {
      setError("PIN must be at least 4 digits.");
      return;
    }

    if (pin !== confirmPin) {
      setError("PIN does not match.");
      return;
    }

    if (!token) {
      setError("Reset token is missing or expired.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/login/reset-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_pin: pin }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        if (data.error === "INVALID_OR_EXPIRED_TOKEN") setError("Token is invalid or expired.");
        else if (data.error === "FORBIDDEN") setError("You don't have permission to reset PIN.");
        else setError("Unable to reset PIN. Please try again.");
        return;
      }

      setSuccess("PIN reset successfully. Redirecting to login...");
      setTimeout(() => navigate("/login"), 1000);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm rounded-[1rem] border border-[#FECACA] bg-white p-8 shadow-[0_4px_24px_rgba(220,38,38,0.10)]">
        <h1 className="mb-1 text-center text-2xl font-bold text-[#111111]">Reset PIN</h1>
        <p className="mb-6 text-center text-sm text-[#777777]">Set a new PIN for the employee account.</p>

        <label className="text-sm font-medium text-[#555555]">New PIN</label>
        <input
          type="password"
          value={pin}
          onChange={(event) => setPin(event.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          disabled={loading}
        />

        <label className="text-sm font-medium text-[#555555]">Confirm PIN</label>
        <input
          type="password"
          value={confirmPin}
          onChange={(event) => setConfirmPin(event.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          disabled={loading}
        />

        {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}
        {success && <p className="mb-3 text-center text-sm text-green-600">{success}</p>}

        <button
          type="button"
          onClick={() => {
            void handleReset();
          }}
          disabled={loading}
          className="mt-2 w-full rounded-xl bg-[#DC2626] py-2.5 font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.25)] transition hover:bg-[#991B1B] disabled:opacity-50"
        >
          {loading ? "Saving..." : "Reset PIN"}
        </button>

        <p className="mt-4 text-center text-xs text-[#555555]">
          <Link to="/dashboard" className="font-medium text-[#DC2626] hover:text-[#991B1B]">
            Back to dashboard
          </Link>
        </p>
      </div>
    </div>
  );
}
