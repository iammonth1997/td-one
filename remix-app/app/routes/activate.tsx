import { useState } from "react";
import { useNavigate } from "react-router";
import type { Route } from "./+types/activate";

export async function loader({ request }: Route.LoaderArgs) {
  // Check if already logged in, redirect to dashboard
  const token = await getSessionToken(request);
  if (token) {
    return new Response(null, {
      status: 302,
      headers: { Location: "/dashboard" },
    });
  }
  return null;
}

async function getSessionToken(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  const cookies = cookieHeader.split(";").reduce(
    (acc, cookie) => {
      const [name, value] = cookie.split("=").map((s) => s.trim());
      acc[name] = value;
      return acc;
    },
    {} as Record<string, string>
  );
  return cookies["session_token"] || null;
}

export default function ActivatePage() {
  const navigate = useNavigate();
  const [empId, setEmpId] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleActivate() {
    if (!empId || !activationCode || !password || !confirmPassword) {
      setError("All fields are required.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 12 || password.length > 128) {
      setError("Password must be 12-128 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/login/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emp_id: empId,
          activation_code: activationCode,
          password,
        }),
      });

      const data = (await res.json()) as { error?: string; session_token?: string };
      if (!res.ok) {
        if (data.error === "EMPLOYEE_NOT_FOUND") setError("Employee not found.");
        else if (data.error === "INVALID_ACTIVATION_CODE") setError("Invalid or expired activation code.");
        else if (data.error === "ACCOUNT_ALREADY_ACTIVATED") setError("This account is already activated. Please log in.");
        else if (data.error === "INVALID_PASSWORD_FORMAT") setError("Password must be 12-128 characters.");
        else setError(data.error || "Activation failed. Please try again.");
        return;
      }

      // Store session token
      if (data.session_token) {
        document.cookie = `session_token=${data.session_token}; Path=/; Max-Age=2592000; HttpOnly`;
      }

      setError("");
      navigate("/dashboard");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !loading) {
      void handleActivate();
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm rounded-[1rem] border border-[#FECACA] bg-white p-8 shadow-[0_4px_24px_rgba(220,38,38,0.10)]">
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
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z" />
            </svg>
          </div>
        </div>

        <h1 className="mb-2 text-center text-2xl font-bold text-[#111111]">Activate Account</h1>
        <p className="mb-6 text-center text-sm text-[#777777]">
          Welcome! Please use your activation code to set up your account.
        </p>

        <label className="text-sm font-medium text-[#555555]">Employee ID</label>
        <input
          type="text"
          value={empId}
          onChange={(e) => setEmpId(e.target.value)}
          onKeyDown={handleKeyDown}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          placeholder="EMP001"
          disabled={loading}
        />

        <label className="text-sm font-medium text-[#555555]">Activation Code</label>
        <input
          type="text"
          value={activationCode}
          onChange={(e) => setActivationCode(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          placeholder="ABC123XYZ789"
          disabled={loading}
        />

        <label className="text-sm font-medium text-[#555555]">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          className="mb-2 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          placeholder="12+ characters"
          disabled={loading}
        />
        <p className="mb-4 text-xs text-[#666666]">Min 12 characters. Use mix of letters, numbers, symbols.</p>

        <label className="text-sm font-medium text-[#555555]">Confirm Password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          placeholder="Confirm password"
          disabled={loading}
        />

        {error && <p className="mb-3 text-center text-sm text-red-600">{error}</p>}

        <button
          type="button"
          onClick={() => {
            void handleActivate();
          }}
          disabled={loading}
          className="mt-2 w-full rounded-xl bg-[#DC2626] py-2.5 font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.25)] transition hover:bg-[#991B1B] disabled:opacity-50"
        >
          {loading ? "Activating..." : "Activate Account"}
        </button>

        <p className="mt-4 text-center text-xs text-[#555555]">
          Already have an account?{" "}
          <button
            onClick={() => navigate("/login")}
            className="font-medium text-[#DC2626] hover:text-[#991B1B]"
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
