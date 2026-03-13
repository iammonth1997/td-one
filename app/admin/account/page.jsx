"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/Header";
import { useSession } from "@/app/hooks/useSession";

export default function AdminAccountPage() {
  const router = useRouter();
  const { session, loading, getAuthHeaders } = useSession({
    loginPath: "/admin/login",
    requiredPortal: "admin_portal",
  });

  const [empId, setEmpId] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    if (busy) return;

    setError("");
    setSuccess("");
    setBusy(true);

    try {
      const res = await fetch("/api/admin/account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          emp_id: empId,
          admin_email: adminEmail,
          admin_password: adminPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.error === "FORBIDDEN") setError("คุณไม่มีสิทธิ์จัดการบัญชีผู้ดูแล");
        else if (data.error === "FORBIDDEN_PORTAL_CONTEXT") setError("ต้องเข้าสู่ระบบผ่าน Admin Portal");
        else if (data.error === "USER_NOT_FOUND") setError("ไม่พบรหัสพนักงาน");
        else if (data.error === "INVALID_EMAIL") setError("รูปแบบอีเมลไม่ถูกต้อง");
        else if (data.error === "EMAIL_ALREADY_USED") setError("อีเมลนี้ถูกใช้งานแล้ว");
        else if (data.error === "INVALID_INPUT") setError("กรอกข้อมูลไม่ครบ หรือรหัสผ่านสั้นกว่า 8 ตัว");
        else setError("บันทึกไม่สำเร็จ");
        return;
      }

      setSuccess(`บันทึกบัญชีแอดมินสำเร็จ: ${data.emp_id} (${data.admin_email})`);
      setAdminPassword("");
    } finally {
      setBusy(false);
    }
  }

  if (loading || !session) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#F5F7FA] text-[#1A2B4A]">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#1A2B4A]">
      <Header />

      <div className="max-w-3xl mx-auto p-6">
        <div className="mb-4">
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="text-sm text-[#1352A3] hover:underline"
          >
            ← กลับหน้า Admin Portal
          </button>
        </div>

        <div className="rounded-xl border border-[#D0D8E4] bg-white p-6 shadow-[0_2px_12px_rgba(13,59,122,0.06)]">
          <h1 className="text-2xl font-bold">ตั้งค่า Admin Email Login</h1>
          <p className="text-sm text-[#6B7A99] mt-1">กำหนดอีเมลและรหัสผ่านสำหรับเข้าใช้งานส่วนบริหาร (ระบบจะ hash ให้อัตโนมัติ)</p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="text-sm font-medium text-[#334260]">รหัสพนักงาน</label>
              <input
                type="text"
                value={empId}
                onChange={(e) => setEmpId(e.target.value.toUpperCase())}
                placeholder="L2207014"
                className="w-full mt-1 p-2.5 rounded-lg bg-[#F5F7FA] text-[#1A2B4A] border border-[#D0D8E4] focus:outline-none focus:border-[#1352A3] focus:ring-1 focus:ring-[#1352A3]"
                disabled={busy}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#334260]">Admin Email</label>
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="manager@company.com"
                className="w-full mt-1 p-2.5 rounded-lg bg-[#F5F7FA] text-[#1A2B4A] border border-[#D0D8E4] focus:outline-none focus:border-[#1352A3] focus:ring-1 focus:ring-[#1352A3]"
                disabled={busy}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#334260]">Admin Password (ขั้นต่ำ 8 ตัว)</label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full mt-1 p-2.5 rounded-lg bg-[#F5F7FA] text-[#1A2B4A] border border-[#D0D8E4] focus:outline-none focus:border-[#1352A3] focus:ring-1 focus:ring-[#1352A3]"
                disabled={busy}
              />
            </div>

            {error ? <p className="text-red-600 text-sm">{error}</p> : null}
            {success ? <p className="text-green-700 text-sm">{success}</p> : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full md:w-auto px-5 py-2.5 bg-[#1352A3] hover:bg-[#0D3B7A] disabled:opacity-50 text-white font-semibold rounded-lg transition"
            >
              {busy ? "Saving..." : "บันทึกข้อมูล Admin Email"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
