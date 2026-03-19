import { useState } from "react";
import { Link, useNavigate } from "react-router";

export default function LoginPage() {
  const navigate = useNavigate();
  const [empId, setEmpId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pinSet, setPinSet] = useState<boolean | null>(null);

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

      const data = (await res.json()) as {
        error?: string;
        reason?: string;
        minutes_remaining?: number;
        must_change_pin?: boolean;
      };

      if (!res.ok) {
        if (data.error === "INVALID_CREDENTIALS") {
          setPinSet(true);
          setError("Invalid Employee ID or PIN.");
        } else if (data.error === "TEMP_PIN_EXPIRED") setError("Temporary PIN expired. Please contact HR.");
        else if (data.error === "ACCOUNT_BLOCKED") setError(`Account blocked (${data.reason || "unknown"}).`);
        else if (data.error === "ACCOUNT_LOCKED") {
          setError(`Too many attempts. Try again in ${data.minutes_remaining || 15} minute(s).`);
        } else {
          setError("Login failed. Please try again.");
        }
        return;
      }

      if (data.must_change_pin) navigate("/change-pin");
      else navigate("/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      void handleLogin();
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm rounded-[1rem] border border-[#FECACA] bg-white p-8 shadow-[0_12px_36px_rgba(220,38,38,0.15)]">
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#DC2626] shadow-[0_10px_24px_rgba(220,38,38,0.28)]">
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          </div>
        </div>

        <h1 className="mb-6 text-center text-2xl font-bold text-[#111111]">Employee Login</h1>

        <label className="text-sm font-medium text-[#555555]">Employee ID</label>
        <input
          type="text"
          value={empId}
          onChange={(e) => setEmpId(e.target.value)}
          onKeyDown={handleKeyDown}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-2.5 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          placeholder="EMP001"
          disabled={loading}
        />

        <label className="text-sm font-medium text-[#555555]">Password</label>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={handleKeyDown}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-2.5 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          placeholder="••••••••••••"
          disabled={loading}
        />

        {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={() => {
            void handleLogin();
          }}
          disabled={loading}
          className="mt-2 w-full rounded-xl bg-[#DC2626] py-2.5 font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.25)] transition hover:bg-[#991B1B] disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in"}
        </button>

        {pinSet !== true && (
          <p className="mt-4 text-center text-xs text-[#555555]">
            Don&apos;t have a password?{" "}
            <Link to="/set-pin" className="font-medium text-[#DC2626] hover:text-[#991B1B]">
              Set Password
            </Link>
          </p>
        )}

        <p className={`text-center text-xs text-[#555555] ${pinSet !== true ? "mt-2" : "mt-4"}`}>
          Need HR to reset your password?{" "}
          <Link to="/forgot-pin" className="font-medium text-[#DC2626] hover:text-[#991B1B]">
            Reset Password
          </Link>
        </p>
      </div>
    </div>
  );
}
