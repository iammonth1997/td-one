import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { ensureDeviceIdCookie, getOrCreateDeviceId } from "~/lib/device-id";

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    ensureDeviceIdCookie();
  }, []);

  async function handleLogin() {
    if (loading) return;
    setError("");

    if (!email.trim() || !password.trim()) {
      setError("กรุณากรอกอีเมลและรหัสผ่าน");
      return;
    }

    setLoading(true);

    try {
      const deviceId = getOrCreateDeviceId();
      ensureDeviceIdCookie();

      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-device-id": deviceId,
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json().catch(() => ({} as Record<string, unknown>)) as {
        error?: string;
        message?: string;
        reason?: string;
        detail?: string;
        success?: boolean;
      };

      if (!res.ok) {
        if (data.error === "INVALID_INPUT") {
          setError("กรุณากรอกอีเมลและรหัสผ่าน");
        } else if (data.error === "INVALID_CREDENTIALS") {
          setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
        } else if (data.error === "FORBIDDEN") {
          setError("บัญชีนี้ไม่มีสิทธิ์เข้าระบบบริหาร");
        } else if (data.error === "EMPLOYEE_NOT_FOUND") {
          setError("ไม่พบข้อมูลพนักงาน");
        } else if (data.error === "ACCOUNT_BLOCKED") {
          setError(`บัญชีถูกระงับ (${data.reason || "unknown"})`);
        } else if (data.error === "MISSING_DEVICE_ID") {
          setError("ไม่พบ Device ID กรุณารีเฟรชหน้า");
        } else if (data.error === "DB_QUERY_FAILED") {
          setError(`เชื่อมต่อฐานข้อมูลไม่ได้: ${String(data.detail ?? "unknown")}`);
        } else if (data.error === "SESSION_CREATE_FAILED") {
          setError("สร้าง Session ไม่สำเร็จ กรุณาลองใหม่");
        } else if (data.error === "ADMIN_LOGIN_FAILED") {
          setError(`เกิดข้อผิดพลาด: ${String(data.detail ?? "unknown")}`);
        } else {
          setError(data.message || data.error || "เข้าสู่ระบบไม่สำเร็จ");
        }
        return;
      }

      navigate("/admin/dashboard");
    } catch {
      setError("เครือข่ายมีปัญหา กรุณาลองใหม่");
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
    <div className="flex min-h-screen items-center justify-center px-4" style={{ background: "linear-gradient(to bottom right, #1b2738, #0f172a)" }}>
      <div className="w-full max-w-sm rounded-[1rem] p-8" style={{ backgroundColor: "#1e293b", border: "1px solid #334155", boxShadow: "0 12px 36px rgba(0,0,0,0.4)" }}>
        <div className="mb-4 flex justify-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: "#DC2626", boxShadow: "0 10px 24px rgba(220,38,38,0.28)" }}>
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
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
        </div>

        <h1 className="mb-1 text-center text-2xl font-bold" style={{ color: "#ffffff" }}>ระบบฝ่ายบริหาร</h1>
        <p className="mb-6 text-center text-sm" style={{ color: "#94a3b8" }}>TD One Admin Portal</p>

        <label className="text-sm font-medium" style={{ color: "#94a3b8" }}>อีเมล</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          className="mb-4 mt-1 w-full rounded-xl p-2.5 text-white focus:outline-none focus:ring-1"
          style={{ backgroundColor: "#0f172a", border: "1px solid #334155", color: "#ffffff" }}
          placeholder="manager@company.com"
          autoComplete="email"
          disabled={loading}
        />

        <label className="text-sm font-medium" style={{ color: "#94a3b8" }}>รหัสผ่าน</label>
        <div className="relative mb-4 mt-1">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-xl p-2.5 pr-11 focus:outline-none focus:ring-1"
            style={{ backgroundColor: "#0f172a", border: "1px solid #334155", color: "#ffffff" }}
            placeholder="••••••••••••"
            autoComplete="current-password"
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2"
            style={{ color: "#64748b" }}
            tabIndex={-1}
            aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}
          >
            {showPassword ? (
              /* eye-off */
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
              /* eye */
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            )}
          </button>
        </div>

        {error && <p className="mb-3 text-center text-sm text-red-500">{error}</p>}

        <button
          type="button"
          onClick={() => void handleLogin()}
          disabled={loading}
          className="mt-2 w-full rounded-xl py-2.5 font-semibold text-white transition disabled:opacity-50"
          style={{ backgroundColor: "#DC2626", boxShadow: "0 10px 24px rgba(220,38,38,0.25)" }}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.backgroundColor = "#991B1B"; }}
          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#DC2626"; }}
        >
          {loading ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
        </button>
      </div>
    </div>
  );
}
