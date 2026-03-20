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
    .select("force_pin_change, must_change_password")
    .eq("emp_id", session.emp_id)
    .maybeSingle();

  return {
    empId: session.emp_id,
    mustChangePassword: Boolean(user?.force_pin_change || user?.must_change_password),
  };
}

export default function ChangePasswordPage({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (loading) return;
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Password does not match.");
      return;
    }

    if (!loaderData.mustChangePassword && currentPassword.length < 1) {
      setError("Current password is required.");
      return;
    }

    if (newPassword.length < 12) {
      setError("New password must be at least 12 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/login/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        if (data.error === "TEMP_PIN_EXPIRED") setError("Temporary password expired. Please contact HR.");
        else if (data.error === "INVALID_CURRENT_PIN") setError("Current password is incorrect.");
        else if (["INVALID_PIN_FORMAT", "PASSWORD_TOO_SHORT", "PASSWORD_TOO_LONG"].includes(String(data.error))) {
          setError("New password must be 12-128 characters.");
        } else if (data.error === "PASSWORD_TOO_SIMPLE") {
          setError("Password is too simple. Please use a stronger password.");
        } else if (data.error === "PASSWORD_CONTAINS_EMP_ID") {
          setError("Password must not contain your employee ID.");
        } else if (["PASSWORD_SAME_AS_PREVIOUS", "PASSWORD_RECENTLY_USED"].includes(String(data.error))) {
          setError("New password cannot be the same as recent passwords.");
        }
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
        <h1 className="mb-2 text-center text-2xl font-bold text-[#111111]">{loaderData.mustChangePassword ? "Set New Password" : "Change Password"}</h1>
        <p className="mb-6 text-center text-sm text-[#777777]">
          {loaderData.mustChangePassword
            ? "Please set your own password now."
            : "Enter your current password and choose a new password."}
        </p>

        {!loaderData.mustChangePassword ? (
          <>
            <label className="text-sm font-medium text-[#555555]">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
              disabled={loading}
            />
          </>
        ) : null}

        <label className="text-sm font-medium text-[#555555]">New Password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          placeholder="12+ characters"
          disabled={loading}
        />
        <p className="mb-3 text-xs text-[#666666]">Min 12 characters. Use mix of letters, numbers, symbols.</p>

        <label className="text-sm font-medium text-[#555555]">Confirm Password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
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
