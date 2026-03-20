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

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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

    if (password.length < 12) {
      setError("Password must be at least 12 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Password does not match.");
      return;
    }

    if (!token) {
      setError("Reset token is missing or expired.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/login/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        if (data.error === "INVALID_OR_EXPIRED_TOKEN") setError("Token is invalid or expired.");
        else if (["INVALID_PIN_FORMAT", "PASSWORD_TOO_SHORT", "PASSWORD_TOO_LONG"].includes(String(data.error))) {
          setError("Password must be 12-128 characters.");
        } else if (data.error === "PASSWORD_TOO_SIMPLE") {
          setError("Password is too simple. Please use a stronger password.");
        } else if (data.error === "PASSWORD_CONTAINS_EMP_ID") {
          setError("Password must not contain employee ID.");
        } else if (data.error === "FORBIDDEN") setError("You don't have permission to reset password.");
        else setError("Unable to reset password. Please try again.");
        return;
      }

      setSuccess("Password reset successfully. Redirecting to login...");
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
        <h1 className="mb-1 text-center text-2xl font-bold text-[#111111]">Reset Password</h1>
        <p className="mb-6 text-center text-sm text-[#777777]">Set a new password for the employee account.</p>

        <label className="text-sm font-medium text-[#555555]">New Password</label>
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          placeholder="12+ characters"
          disabled={loading}
        />
        <p className="mb-3 text-xs text-[#666666]">Min 12 characters. Use mix of letters, numbers, symbols.</p>

        <label className="text-sm font-medium text-[#555555]">Confirm Password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          placeholder="Confirm password"
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
          {loading ? "Saving..." : "Reset Password"}
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
