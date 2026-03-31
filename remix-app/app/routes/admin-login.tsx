import { useEffect, useState } from "react";
import { useNavigate } from "react-router";

import { ensureDeviceIdCookie, getOrCreateDeviceId } from "~/lib/device-id";
import { useI18n } from "~/lib/i18n";
import type { LangCode } from "~/lib/i18n.shared";

const ADMIN_LOGIN_I18N: Record<
  LangCode,
  {
    title: string;
    subtitle: string;
    email: string;
    password: string;
    showPassword: string;
    hidePassword: string;
    login: string;
    loggingIn: string;
    missingCredentials: string;
    invalidCredentials: string;
    forbidden: string;
    employeeNotFound: string;
    accountBlocked: (reason: string) => string;
    missingDevice: string;
    dbError: (detail: string) => string;
    sessionFailed: string;
    loginFailed: (detail: string) => string;
    genericFailed: string;
    networkError: string;
  }
> = {
  th: {
    title: "ระบบฝ่ายบริหาร",
    subtitle: "TD One Admin Portal",
    email: "อีเมล",
    password: "รหัสผ่าน",
    showPassword: "แสดงรหัสผ่าน",
    hidePassword: "ซ่อนรหัสผ่าน",
    login: "เข้าสู่ระบบ",
    loggingIn: "กำลังเข้าสู่ระบบ...",
    missingCredentials: "กรุณากรอกอีเมลและรหัสผ่าน",
    invalidCredentials: "อีเมลหรือรหัสผ่านไม่ถูกต้อง",
    forbidden: "บัญชีนี้ไม่มีสิทธิ์เข้าระบบบริหาร",
    employeeNotFound: "ไม่พบข้อมูลพนักงาน",
    accountBlocked: (reason) => `บัญชีถูกระงับ (${reason})`,
    missingDevice: "ไม่พบ Device ID กรุณารีเฟรชหน้า",
    dbError: (detail) => `เชื่อมต่อฐานข้อมูลไม่ได้: ${detail}`,
    sessionFailed: "สร้าง Session ไม่สำเร็จ กรุณาลองใหม่",
    loginFailed: (detail) => `เกิดข้อผิดพลาด: ${detail}`,
    genericFailed: "เข้าสู่ระบบไม่สำเร็จ",
    networkError: "เครือข่ายมีปัญหา กรุณาลองใหม่",
  },
  en: {
    title: "Administration",
    subtitle: "TD One Admin Portal",
    email: "Email",
    password: "Password",
    showPassword: "Show password",
    hidePassword: "Hide password",
    login: "Sign in",
    loggingIn: "Signing in...",
    missingCredentials: "Please enter email and password.",
    invalidCredentials: "Email or password is incorrect.",
    forbidden: "This account does not have admin access.",
    employeeNotFound: "Employee record not found.",
    accountBlocked: (reason) => `Account blocked (${reason})`,
    missingDevice: "Device ID is missing. Please refresh the page.",
    dbError: (detail) => `Database connection failed: ${detail}`,
    sessionFailed: "Unable to create a session. Please try again.",
    loginFailed: (detail) => `Login failed: ${detail}`,
    genericFailed: "Unable to sign in.",
    networkError: "Network error. Please try again.",
  },
  lo: {
    title: "ລະບົບຝ່າຍບໍລິຫານ",
    subtitle: "TD One Admin Portal",
    email: "ອີເມວ",
    password: "ລະຫັດຜ່ານ",
    showPassword: "ສະແດງລະຫັດຜ່ານ",
    hidePassword: "ຊ່ອນລະຫັດຜ່ານ",
    login: "ເຂົ້າລະບົບ",
    loggingIn: "ກຳລັງເຂົ້າລະບົບ...",
    missingCredentials: "ກະລຸນາໃສ່ອີເມວແລະລະຫັດຜ່ານ",
    invalidCredentials: "ອີເມວ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ",
    forbidden: "ບັນຊີນີ້ບໍ່ມີສິດເຂົ້າລະບົບບໍລິຫານ",
    employeeNotFound: "ບໍ່ພົບຂໍ້ມູນພະນັກງານ",
    accountBlocked: (reason) => `ບັນຊີຖືກລະງັບ (${reason})`,
    missingDevice: "ບໍ່ພົບ Device ID ກະລຸນາ refresh ໜ້າ",
    dbError: (detail) => `ເຊື່ອມຕໍ່ຖານຂໍ້ມູນບໍ່ໄດ້: ${detail}`,
    sessionFailed: "ສ້າງ Session ບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່",
    loginFailed: (detail) => `ເກີດຂໍ້ຜິດພາດ: ${detail}`,
    genericFailed: "ເຂົ້າລະບົບບໍ່ສຳເລັດ",
    networkError: "ເຄືອຂ່າຍມີບັນຫາ ກະລຸນາລອງໃໝ່",
  },
};

export default function AdminLoginPage() {
  const { lang } = useI18n();
  const T = ADMIN_LOGIN_I18N[lang];
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
      setError(T.missingCredentials);
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

      const data = (await res.json().catch(() => ({} as Record<string, unknown>))) as {
        error?: string;
        message?: string;
        reason?: string;
        detail?: string;
      };

      if (!res.ok) {
        if (data.error === "INVALID_INPUT") {
          setError(T.missingCredentials);
        } else if (data.error === "INVALID_CREDENTIALS") {
          setError(T.invalidCredentials);
        } else if (data.error === "FORBIDDEN") {
          setError(T.forbidden);
        } else if (data.error === "EMPLOYEE_NOT_FOUND") {
          setError(T.employeeNotFound);
        } else if (data.error === "ACCOUNT_BLOCKED") {
          setError(T.accountBlocked(String(data.reason || "unknown")));
        } else if (data.error === "MISSING_DEVICE_ID") {
          setError(T.missingDevice);
        } else if (data.error === "DB_QUERY_FAILED") {
          setError(T.dbError(String(data.detail ?? "unknown")));
        } else if (data.error === "SESSION_CREATE_FAILED") {
          setError(T.sessionFailed);
        } else if (data.error === "ADMIN_LOGIN_FAILED") {
          setError(T.loginFailed(String(data.detail ?? "unknown")));
        } else {
          setError(String(data.message || data.error || T.genericFailed));
        }
        return;
      }

      navigate("/admin/dashboard");
    } catch {
      setError(T.networkError);
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

        <h1 className="mb-1 text-center text-2xl font-bold" style={{ color: "#ffffff" }}>{T.title}</h1>
        <p className="mb-6 text-center text-sm" style={{ color: "#94a3b8" }}>{T.subtitle}</p>

        <label className="text-sm font-medium" style={{ color: "#94a3b8" }}>{T.email}</label>
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

        <label className="text-sm font-medium" style={{ color: "#94a3b8" }}>{T.password}</label>
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
            aria-label={showPassword ? T.hidePassword : T.showPassword}
          >
            {showPassword ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            ) : (
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
          {loading ? T.loggingIn : T.login}
        </button>
      </div>
    </div>
  );
}
