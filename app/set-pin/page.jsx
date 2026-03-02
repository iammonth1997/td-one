"use client";

import { useState } from "react";
import Link from "next/link";

export default function SetPinPage() {
  const [empId, setEmpId] = useState("");
  const [dob, setDob] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSetPin() {
    if (loading) return;
    setError("");
    setSuccess("");

    if (pin.length < 4) {
      setError("PIN ต้องมีอย่างน้อย 4 ตัวเลข");
      return;
    }

    if (pin !== confirmPin) {
      setError("PIN ไม่ตรงกัน");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/login/set-pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emp_id: empId, date_of_birth: dob, pin }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.error === "EMPLOYEE_NOT_FOUND") setError("ไม่พบรหัสพนักงานนี้");
        else if (data.error === "INVALID_DOB") setError("วันเกิดไม่ถูกต้อง");
        else setError(data.error || "เกิดข้อผิดพลาด");
        return;
      }

      setSuccess("ตั้ง PIN สำเร็จ! กรุณาไปหน้า Login");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-full max-w-sm bg-gray-900 border border-red-600 rounded-xl p-8 shadow-xl">

        <h1 className="text-3xl font-bold text-center text-white mb-6">
          Set Your PIN
        </h1>

        <label className="text-white text-sm">Employee ID</label>
        <input
          type="text"
          value={empId}
          onChange={(e) => setEmpId(e.target.value)}
          className="w-full mt-1 mb-4 p-2 rounded bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-red-500"
          placeholder="Enter Employee ID"
          disabled={loading}
        />

        <label className="text-white text-sm">Date of Birth</label>
        <input
          type="date"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="w-full mt-1 mb-4 p-2 rounded bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-red-500"
          disabled={loading}
        />

        <label className="text-white text-sm">New PIN (อย่างน้อย 4 ตัว)</label>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="w-full mt-1 mb-4 p-2 rounded bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-red-500"
          placeholder="Enter PIN"
          disabled={loading}
        />

        <label className="text-white text-sm">Confirm PIN</label>
        <input
          type="password"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          className="w-full mt-1 mb-4 p-2 rounded bg-gray-800 text-white border border-gray-700 focus:outline-none focus:border-red-500"
          placeholder="Confirm PIN"
          disabled={loading}
        />

        {error && <p className="text-red-400 text-sm mb-3 text-center">{error}</p>}
        {success && <p className="text-green-400 text-sm mb-3 text-center">{success}</p>}

        <button
          onClick={handleSetPin}
          disabled={loading}
          className="w-full py-2 mt-2 bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white font-semibold rounded-lg shadow-lg"
        >
          {loading ? "กำลังบันทึก..." : "Set PIN"}
        </button>

        <p className="text-center text-gray-400 text-xs mt-4">
          <Link href="/login" className="text-red-400 hover:underline">
            กลับหน้า Login
          </Link>
        </p>

      </div>
    </div>
  );
}
