import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";

import { ensureDeviceIdCookie, getOrCreateDeviceId } from "~/lib/device-id";
import { useI18n } from "~/lib/i18n";
import type { LangCode } from "~/lib/i18n.shared";

const LOGIN_I18N: Record<
  LangCode,
  {
    title: string;
    employeeId: string;
    employeeIdPlaceholder: string;
    password: string;
    passwordPlaceholder: string;
    hidePassword: string;
    showPassword: string;
    signingIn: string;
    signIn: string;
    setPasswordLead: string;
    setPassword: string;
    resetLead: string;
    resetPassword: string;
    missingSession: string;
    missingDevice: string;
    deviceMismatch: string;
    deviceNotTrusted: string;
    missingCredentials: string;
    invalidCredentials: string;
    tempExpired: string;
    accountBlocked: (reason: string) => string;
    accountLocked: (minutes: number) => string;
    deviceLimit: string;
    deviceDeactivated: string;
    serverConfig: string;
    systemError: string;
    loginFailed: (message?: string) => string;
    networkError: string;
  }
> = {
  th: {
    title: "เข้าสู่ระบบพนักงาน",
    employeeId: "รหัสพนักงาน",
    employeeIdPlaceholder: "กรุณากรอกรหัสพนักงาน",
    password: "รหัสผ่าน",
    passwordPlaceholder: "กรอกรหัสผ่าน",
    hidePassword: "ซ่อนรหัสผ่าน",
    showPassword: "แสดงรหัสผ่าน",
    signingIn: "กำลังเข้าสู่ระบบ...",
    signIn: "เข้าสู่ระบบ",
    setPasswordLead: "ยังไม่มีรหัสผ่านใช่ไหม?",
    setPassword: "ตั้งรหัสผ่าน",
    resetLead: "ต้องการให้ HR ช่วยรีเซ็ตรหัสผ่านใช่ไหม?",
    resetPassword: "รีเซ็ตรหัสผ่าน",
    missingSession: "ไม่สามารถสร้าง session สำหรับการเข้าสู่ระบบได้ กรุณาเข้าสู่ระบบใหม่",
    missingDevice: "ยืนยันอุปกรณ์ไม่สำเร็จ กรุณารีเฟรชแล้วลองใหม่",
    deviceMismatch: "session นี้มาจากอีกอุปกรณ์หนึ่ง กรุณาเข้าสู่ระบบใหม่",
    deviceNotTrusted: "อุปกรณ์นี้ยังไม่ได้รับสิทธิ์ กรุณาติดต่อ HR/Admin",
    missingCredentials: "กรุณากรอกรหัสพนักงานและรหัสผ่าน",
    invalidCredentials: "รหัสพนักงานหรือรหัสผ่านไม่ถูกต้อง",
    tempExpired: "รหัสผ่านชั่วคราวหมดอายุ กรุณาติดต่อ HR",
    accountBlocked: (reason) => `บัญชีถูกระงับ (${reason})`,
    accountLocked: (minutes) => `พยายามมากเกินไป กรุณาลองอีกครั้งใน ${minutes} นาที`,
    deviceLimit: "อนุญาตสูงสุด 2 อุปกรณ์ กรุณาติดต่อ HR/Admin เพื่อยกเลิกอุปกรณ์เดิม",
    deviceDeactivated: "อุปกรณ์นี้ถูกปิดการใช้งาน กรุณาติดต่อ HR/Admin",
    serverConfig: "การตั้งค่าเซิร์ฟเวอร์ไม่ครบถ้วน กรุณาติดต่อผู้ดูแลระบบ",
    systemError: "เกิดข้อผิดพลาดระหว่างเข้าสู่ระบบ กรุณาลองใหม่อีกครั้ง",
    loginFailed: (message) => (message ? `เข้าสู่ระบบไม่สำเร็จ: ${message}` : "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่"),
    networkError: "เครือข่ายมีปัญหา กรุณาลองใหม่",
  },
  en: {
    title: "Employee Login",
    employeeId: "Employee ID",
    employeeIdPlaceholder: "Enter employee ID",
    password: "Password",
    passwordPlaceholder: "Enter your password",
    hidePassword: "Hide password",
    showPassword: "Show password",
    signingIn: "Signing in...",
    signIn: "Sign in",
    setPasswordLead: "Don't have a password?",
    setPassword: "Set Password",
    resetLead: "Need HR to reset your password?",
    resetPassword: "Reset Password",
    missingSession: "Sign-in session was not created. Please sign in again.",
    missingDevice: "Device verification failed. Please refresh and try again.",
    deviceMismatch: "This session belongs to another device. Please sign in again.",
    deviceNotTrusted: "This device is not trusted. Please contact HR/Admin.",
    missingCredentials: "Please enter Employee ID and password.",
    invalidCredentials: "Invalid Employee ID or password.",
    tempExpired: "Temporary password expired. Please contact HR.",
    accountBlocked: (reason) => `Account blocked (${reason}).`,
    accountLocked: (minutes) => `Too many attempts. Try again in ${minutes} minute(s).`,
    deviceLimit: "Maximum 2 devices allowed. Please contact HR/Admin to deactivate an old device.",
    deviceDeactivated: "This device is deactivated. Please contact HR/Admin.",
    serverConfig: "Server configuration missing. Please contact system admin.",
    systemError: "System error while signing in. Please try again shortly.",
    loginFailed: (message) => (message ? `Login failed: ${message}` : "Login failed. Please try again."),
    networkError: "Network error. Please try again.",
  },
  lo: {
    title: "ເຂົ້າລະບົບພະນັກງານ",
    employeeId: "ລະຫັດພະນັກງານ",
    employeeIdPlaceholder: "ກະລຸນາໃສ່ລະຫັດພະນັກງານ",
    password: "ລະຫັດຜ່ານ",
    passwordPlaceholder: "ໃສ່ລະຫັດຜ່ານ",
    hidePassword: "ຊ່ອນລະຫັດຜ່ານ",
    showPassword: "ສະແດງລະຫັດຜ່ານ",
    signingIn: "ກຳລັງເຂົ້າລະບົບ...",
    signIn: "ເຂົ້າລະບົບ",
    setPasswordLead: "ຍັງບໍ່ມີລະຫັດຜ່ານບໍ?",
    setPassword: "ຕັ້ງລະຫັດຜ່ານ",
    resetLead: "ຕ້ອງການໃຫ້ HR ຊ່ວຍຣີເຊັດລະຫັດຜ່ານບໍ?",
    resetPassword: "ຣີເຊັດລະຫັດຜ່ານ",
    missingSession: "ບໍ່ສາມາດສ້າງ session ສຳລັບການເຂົ້າລະບົບໄດ້ ກະລຸນາເຂົ້າລະບົບໃໝ່",
    missingDevice: "ການຢືນຢັນອຸປະກອນບໍ່ສຳເລັດ ກະລຸນາ refresh ແລ້ວລອງໃໝ່",
    deviceMismatch: "session ນີ້ເປັນຂອງອຸປະກອນອື່ນ ກະລຸນາເຂົ້າລະບົບໃໝ່",
    deviceNotTrusted: "ອຸປະກອນນີ້ຍັງບໍ່ໄດ້ຮັບຄວາມໄວ້ວາງໃຈ ກະລຸນາຕິດຕໍ່ HR/Admin",
    missingCredentials: "ກະລຸນາໃສ່ລະຫັດພະນັກງານແລະລະຫັດຜ່ານ",
    invalidCredentials: "ລະຫັດພະນັກງານ ຫຼື ລະຫັດຜ່ານບໍ່ຖືກຕ້ອງ",
    tempExpired: "ລະຫັດຜ່ານຊົ່ວຄາວໝົດອາຍຸ ກະລຸນາຕິດຕໍ່ HR",
    accountBlocked: (reason) => `ບັນຊີຖືກລະງັບ (${reason})`,
    accountLocked: (minutes) => `ພະຍາຍາມຫຼາຍເກີນໄປ ກະລຸນາລອງໃໝ່ໃນ ${minutes} ນາທີ`,
    deviceLimit: "ອະນຸຍາດສູງສຸດ 2 ອຸປະກອນ ກະລຸນາຕິດຕໍ່ HR/Admin ເພື່ອປິດອຸປະກອນເກົ່າ",
    deviceDeactivated: "ອຸປະກອນນີ້ຖືກປິດການໃຊ້ງານ ກະລຸນາຕິດຕໍ່ HR/Admin",
    serverConfig: "ການຕັ້ງຄ່າ server ບໍ່ຄົບຖ້ວນ ກະລຸນາຕິດຕໍ່ຜູ້ດູແລລະບົບ",
    systemError: "ເກີດຂໍ້ຜິດພາດໃນຂະນະເຂົ້າລະບົບ ກະລຸນາລອງໃໝ່ອີກຄັ້ງ",
    loginFailed: (message) => (message ? `ເຂົ້າລະບົບບໍ່ສຳເລັດ: ${message}` : "ເຂົ້າລະບົບບໍ່ສຳເລັດ ກະລຸນາລອງໃໝ່"),
    networkError: "ເຄືອຂ່າຍມີບັນຫາ ກະລຸນາລອງໃໝ່",
  },
};

export default function LoginPage() {
  const { lang } = useI18n();
  const T = LOGIN_I18N[lang];
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
      setError(T.missingSession);
    } else if (authError === "MISSING_DEVICE_ID") {
      setError(T.missingDevice);
    } else if (authError === "DEVICE_MISMATCH") {
      setError(T.deviceMismatch);
    } else if (authError === "DEVICE_NOT_TRUSTED") {
      setError(T.deviceNotTrusted);
    }
  }, [authError, T]);

  async function handleLogin() {
    if (loading) return;
    setError("");

    if (!empId.trim() || !password.trim()) {
      setError(T.missingCredentials);
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
          setError(T.invalidCredentials);
        } else if (data.error === "TEMP_PIN_EXPIRED") {
          setError(T.tempExpired);
        } else if (data.error === "ACCOUNT_BLOCKED") {
          setError(T.accountBlocked(data.reason || "unknown"));
        } else if (data.error === "ACCOUNT_LOCKED") {
          setError(T.accountLocked(data.minutes_remaining || 15));
        } else if (data.error === "DEVICE_LIMIT_REACHED") {
          setError(T.deviceLimit);
        } else if (data.error === "DEVICE_DEACTIVATED") {
          setError(T.deviceDeactivated);
        } else if (data.error === "SERVER_CONFIG_MISSING") {
          setError(T.serverConfig);
        } else if (data.error === "DB_QUERY_FAILED" || data.error === "SESSION_CREATE_FAILED") {
          setError(T.systemError);
        } else {
          setError(T.loginFailed(data.message?.trim()));
        }
        return;
      }

      if (data.must_change_pin || data.must_change_password) {
        navigate("/change-password");
      } else {
        navigate("/dashboard");
      }
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

        <h1 className="mb-6 text-center text-2xl font-bold text-[#111111]">{T.title}</h1>

        <label className="text-sm font-medium text-[#555555]">{T.employeeId}</label>
        <input
          type="text"
          value={empId}
          onChange={(e) => setEmpId(e.target.value)}
          onKeyDown={handleKeyDown}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-2.5 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          placeholder={T.employeeIdPlaceholder}
          disabled={loading}
        />

        <label className="text-sm font-medium text-[#555555]">{T.password}</label>
        <div className="relative mb-4 mt-1">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-2.5 pr-11 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
            placeholder={T.passwordPlaceholder}
            autoComplete="current-password"
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA3AF] transition hover:text-[#DC2626]"
            tabIndex={-1}
            aria-label={showPassword ? T.hidePassword : T.showPassword}
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
          {loading ? T.signingIn : T.signIn}
        </button>

        {passwordSet !== true && (
          <p className="mt-4 text-center text-xs text-[#555555]">
            {T.setPasswordLead}{" "}
            <Link to="/set-password" className="font-medium text-[#DC2626] hover:text-[#991B1B]">
              {T.setPassword}
            </Link>
          </p>
        )}

        <p className={`text-center text-xs text-[#555555] ${passwordSet !== true ? "mt-2" : "mt-4"}`}>
          {T.resetLead}{" "}
          <Link to="/forgot-password" className="font-medium text-[#DC2626] hover:text-[#991B1B]">
            {T.resetPassword}
          </Link>
        </p>
      </div>
    </div>
  );
}
