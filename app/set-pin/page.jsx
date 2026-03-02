"use client";

import { useState } from "react";

export default function SetPinPage() {
  const [empId, setEmpId] = useState("");
  const [dob, setDob] = useState("");
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSetPin() {
    setError("");
    setSuccess("");

    if (pin !== confirmPin) {
      setError("PIN ไม่ตรงกัน");
      return;
    }

    const res = await fetch("/api/login/set-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        emp_id: empId,
        date_of_birth: dob,
        pin: pin,
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "เกิดข้อผิดพลาด");
      return;
    }

    setSuccess("ตั้ง PIN สำเร็จ! กรุณาไปหน้า Login");
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
          className="w-full mt-1 mb-4 p-2 rounded bg-gray-800 text-white 
          border border-gray-700 focus:outline-none focus:border-red-500"
          placeholder="Enter Employee ID"
        />

        <label className="text-white text-sm">Date of Birth (YYYY-MM-DD)</label>
        <input
          type="text"
          value={dob}
          onChange={(e) => setDob(e.target.value)}
          className="w-full mt-1 mb-4 p-2 rounded bg-gray-800 text-white
          border border-gray-700 focus:outline-none focus:border-red-500"
          placeholder="1997-08-06"
        />

        <label className="text-white text-sm">New PIN</label>
        <input
          type="password"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="w-full mt-1 mb-4 p-2 rounded bg-gray-800 text-white border border-gray-700 
          focus:outline-none focus:border-red-500"
          placeholder="Enter PIN"
        />

        <label className="text-white text-sm">Confirm PIN</label>
        <input
          type="password"
          value={confirmPin}
          onChange={(e) => setConfirmPin(e.target.value)}
          className="w-full mt-1 mb-4 p-2 rounded bg-gray-800 text-white border border-gray-700 
          focus:outline-none focus:border-red-500"
          placeholder="Confirm PIN"
        />

        {error && <p className="text-red-400 text-sm mb-3 text-center">{error}</p>}
        {success && <p className="text-green-400 text-sm mb-3 text-center">{success}</p>}

        <button
          onClick={handleSetPin}
          className="w-full py-2 mt-2 bg-red-700 hover:bg-red-800 text-white font-semibold 
          rounded-lg shadow-lg"
        >
          Set PIN
        </button>

      </div>
    </div>
  );
}
