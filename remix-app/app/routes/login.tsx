import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { ensureDeviceIdCookie, getOrCreateDeviceId } from "~/lib/device-id";

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [empId, setEmpId] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [passwordSet, setPasswordSet] = useState<boolean | null>(null);
  const authError = searchParams.get("auth_error");

  useEffect(() => {
    ensureDeviceIdCookie();
  }, []);

  useEffect(() => {
    if (!authError) return;

    if (authError === "MISSING_SESSION_TOKEN") {
      setError("Sign-in session was not created. Please sign in again.");
    } else if (authError === "MISSING_DEVICE_ID") {
      setError("Device verification failed. Please refresh and try again.");
    } else if (authError === "DEVICE_MISMATCH") {
      setError("This session belongs to another device. Please sign in again.");
    } else if (authError === "DEVICE_NOT_TRUSTED") {
      setError("This device is not trusted. Please contact HR/Admin.");
    }
  }, [authError]);

  async function handleLogin() {
    if (loading) return;
    setError("");

    if (!empId.trim() || !password.trim()) {
      setError("Please enter Employee ID and password.");
      return;
    }

    setLoading(true);

    try {
      const deviceId = getOrCreateDeviceId();
      ensureDeviceIdCookie();

      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emp_id: empId,
          password,
          device_id: deviceId,
          device_name: navigator.userAgent,
          platform: "web",
          app_version: null,
        }),
      });

      const rawBody = await res.text();
      let data: {
        error?: string;
        message?: string;
        reason?: string;
        minutes_remaining?: number;
        must_change_pin?: boolean;
        must_change_password?: boolean;
      } = {};

      try {
        data = rawBody ? (JSON.parse(rawBody) as typeof data) : {};
      } catch {
        data = {
          error: `HTTP_${res.status}`,
          message: rawBody?.slice(0, 160) || undefined,
        };
      }

      if (!res.ok) {
        if (data.error === "INVALID_CREDENTIALS") {
          setPasswordSet(true);
          setError("Invalid Employee ID or password.");
        } else if (data.error === "TEMP_PIN_EXPIRED") {
          setError("Temporary password expired. Please contact HR.");
        } else if (data.error === "ACCOUNT_BLOCKED") {
          setError(`Account blocked (${data.reason || "unknown"}).`);
        } else if (data.error === "ACCOUNT_LOCKED") {
          setError(`Too many attempts. Try again in ${data.minutes_remaining || 15} minute(s).`);
        } else if (data.error === "DEVICE_LIMIT_REACHED") {
          setError("Maximum 2 devices allowed. Please contact HR/Admin to deactivate an old device.");
        } else if (data.error === "DEVICE_DEACTIVATED") {
          setError("This device is deactivated. Please contact HR/Admin.");
        } else if (data.error === "SERVER_CONFIG_MISSING") {
          setError("Server configuration missing. Please contact system admin.");
        } else if (data.error === "DB_QUERY_FAILED" || data.error === "SESSION_CREATE_FAILED") {
          setError("System error while signing in. Please try again shortly.");
        } else {
          const fallback = data.message?.trim();
          setError(fallback ? `Login failed: ${fallback}` : "Login failed. Please try again.");
        }
        return;
      }

      if (data.must_change_pin || data.must_change_password) {
        navigate("/change-password");
      } else {
        navigate("/dashboard");
      }
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
          placeholder="กรุณากรอกรหัสพนักงาน"
          disabled={loading}
        />

        <label className="text-sm font-medium text-[#555555]">Password</label>
        <div className="relative mb-4 mt-1">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-2.5 pr-11 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
            placeholder="Enter your password"
            autoComplete="current-password"
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] transition hover:text-[#DC2626]"
            tabIndex={-1}
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>

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

        {passwordSet !== true && (
          <p className="mt-4 text-center text-xs text-[#555555]">
            Don&apos;t have a password?{" "}
            <Link to="/set-password" className="font-medium text-[#DC2626] hover:text-[#991B1B]">
              Set Password
            </Link>
          </p>
        )}

        <p className={`text-center text-xs text-[#555555] ${passwordSet !== true ? "mt-2" : "mt-4"}`}>
          Need HR to reset your password?{" "}
          <Link to="/forgot-password" className="font-medium text-[#DC2626] hover:text-[#991B1B]">
            Reset Password
          </Link>
        </p>
      </div>
    </div>
  );
}
