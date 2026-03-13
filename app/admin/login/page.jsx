"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    if (loading) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.error === "INVALID_CREDENTIALS") setError("อีเมลหรือรหัสผ่านไม่ถูกต้อง");
        else if (data.error === "FORBIDDEN") setError("บัญชีนี้ไม่มีสิทธิ์เข้าใช้งานส่วนบริหาร");
        else if (data.error === "ACCOUNT_BLOCKED") setError(`บัญชีถูกระงับ (${data.reason || "unknown"})`);
        else setError("เข้าสู่ระบบไม่สำเร็จ");
        return;
      }

      localStorage.setItem(
        "tdone_session",
        JSON.stringify({
          emp_id: data.emp_id,
          role: data.role,
          status: data.status,
          login_context: "admin_portal",
          login_time: new Date().toISOString(),
          session_token: data.session_token,
          must_change_pin: false,
        })
      );

      router.replace("/admin");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") {
      handleLogin();
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#E8F0FB] px-4">
      <div className="w-full max-w-sm bg-white border border-[#D0D8E4] rounded-2xl p-8 shadow-[0_4px_24px_rgba(13,59,122,0.10)]">
        <h1 className="text-2xl font-bold text-center text-[#1A2B4A] mb-6">Admin Login</h1>

        <label className="text-[#334260] text-sm font-medium">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full mt-1 mb-4 p-2.5 rounded-lg bg-[#F5F7FA] text-[#1A2B4A] border border-[#D0D8E4] focus:outline-none focus:border-[#1352A3] focus:ring-1 focus:ring-[#1352A3]"
          placeholder="admin@company.com"
          disabled={loading}
        />

        <label className="text-[#334260] text-sm font-medium">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full mt-1 mb-4 p-2.5 rounded-lg bg-[#F5F7FA] text-[#1A2B4A] border border-[#D0D8E4] focus:outline-none focus:border-[#1352A3] focus:ring-1 focus:ring-[#1352A3]"
          placeholder="••••••••"
          disabled={loading}
        />

        {error ? <p className="text-red-500 text-sm mb-3 text-center">{error}</p> : null}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full py-2.5 mt-2 bg-[#1352A3] hover:bg-[#0D3B7A] disabled:opacity-50 text-white font-semibold rounded-lg shadow transition"
        >
          {loading ? "Signing in..." : "Sign in (Admin)"}
        </button>
      </div>
    </div>
  );
}
