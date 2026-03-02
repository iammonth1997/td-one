"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [empId, setEmpId] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  function getDeviceId() {
    let id = localStorage.getItem("tdone_device_id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("tdone_device_id", id);
    }
    return id;
  }

  async function handleLogin() {
    if (loading) return;
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emp_id: empId, pin, device_id: getDeviceId() }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "USER_NOT_FOUND") setError("ไม่พบรหัสพนักงานนี้");
        else if (data.error === "EMPLOYEE_NOT_FOUND") setError("ไม่พบข้อมูลพนักงาน");
        else if (data.error === "INVALID_PIN") setError("รหัส PIN ไม่ถูกต้อง");
        else if (data.error === "PIN_NOT_SET") setError("ยังไม่ได้ตั้งรหัสผ่าน กรุณาตั้ง PIN ก่อน");
        else if (data.error === "ACCOUNT_BLOCKED") setError(`บัญชีนี้ไม่สามารถเข้าได้ (${data.reason})`);
        else if (data.error === "DEVICE_NOT_ALLOWED") setError("อุปกรณ์นี้ไม่ได้รับอนุญาต");
        else setError("เกิดข้อผิดพลาด กรุณาลองใหม่");
        return;
      }

      localStorage.setItem(
        "tdone_session",
        JSON.stringify({
          emp_id: empId,
          role: data.role,
          status: data.status,
          login_time: new Date().toISOString(),
        })
      );

      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e) {
    if (e.key === "Enter") handleLogin();
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-full max-w-sm bg-gray-900 border border-red-600 rounded-xl p-8 shadow-xl">
        <h1 className="text-3xl font-bold text-center text-white mb-6">
          TD One Login
        </h1>

        <label className="text-white text-sm">Employee ID</label>
        <input
          type="text"
          value={empId}
          onChange={(e) => setEmpId(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full mt-1 mb-4 p-2 rounded bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-red-500"
          placeholder="Enter Employee ID"
          disabled={loading}
        />

        <label className="text-white text-sm">PIN</label>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full mt-1 mb-4 p-2 rounded bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-red-500"
          placeholder="Enter PIN"
          disabled={loading}
        />

        {error && (
          <p className="text-red-400 text-sm mb-3 text-center">{error}</p>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          className="w-full py-2 mt-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-semibold rounded-lg shadow-lg"
        >
          {loading ? "กำลังเข้าสู่ระบบ..." : "Login"}
        </button>

        <p className="text-center text-gray-400 text-xs mt-4">
          ยังไม่มี PIN?{" "}
          <Link href="/set-pin" className="text-red-400 hover:underline">
            ตั้ง PIN ที่นี่
          </Link>
        </p>

        <p className="text-center text-gray-500 text-xs mt-2">
          ThaiDrill Lao • Human Resource System
        </p>
      </div>
    </div>
  );
}
