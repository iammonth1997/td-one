"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { writeStoredSession } from "@/lib/clientSession";

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

      writeStoredSession({
        emp_id: data.emp_id,
        role: data.role,
        status: data.status,
        login_context: "admin_portal",
        login_time: new Date().toISOString(),
        session_token: data.session_token,
        must_change_pin: false,
      });

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
    <div className="flex min-h-screen items-center justify-center bg-white px-4">
      <div className="w-full max-w-sm rounded-[1rem] border border-[#FECACA] bg-white p-8 shadow-[0_12px_36px_rgba(220,38,38,0.15)]">
        <h1 className="mb-6 text-center text-2xl font-bold text-[#111111]">Admin Login</h1>

        <label className="text-sm font-medium text-[#555555]">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={handleKeyDown}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-2.5 text-[#111111] placeholder:text-[#777777] focus:outline-none focus:border-[#DC2626] focus:ring-1 focus:ring-[#DC2626]"
          placeholder="admin@company.com"
          disabled={loading}
        />

        <label className="text-sm font-medium text-[#555555]">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={handleKeyDown}
          className="mb-4 mt-1 w-full rounded-xl border border-[#FECACA] bg-[#FEF2F2] p-2.5 text-[#111111] placeholder:text-[#777777] focus:outline-none focus:border-[#DC2626] focus:ring-1 focus:ring-[#DC2626]"
          placeholder="••••••••"
          disabled={loading}
        />

        {error ? <p className="text-red-500 text-sm mb-3 text-center">{error}</p> : null}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="mt-2 w-full rounded-xl bg-[#DC2626] py-2.5 font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.25)] transition hover:bg-[#991B1B] disabled:opacity-50"
        >
          {loading ? "Signing in..." : "Sign in (Admin)"}
        </button>
      </div>
    </div>
  );
}
