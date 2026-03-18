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
      <div className="flex min-h-screen items-center justify-center bg-white text-[#555555]">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-[#111111]">
      <Header portal="admin_portal" loginPath="/admin/login" />

      <div className="max-w-3xl mx-auto p-6">
        <div className="mb-4">
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="text-sm text-[#DC2626] transition hover:text-[#991B1B]"
          >
            ← กลับหน้า Admin Portal
          </button>
        </div>

        <div className="rounded-[1rem] border border-[#FECACA] bg-white p-6 shadow-[0_4px_24px_rgba(220,38,38,0.10)]">
          <h1 className="text-2xl font-bold">ตั้งค่า Admin Email Login</h1>
          <p className="mt-1 text-sm text-[#777777]">กำหนดอีเมลและรหัสผ่านสำหรับเข้าใช้งานส่วนบริหาร (ระบบจะ hash ให้อัตโนมัติ)</p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="text-sm font-medium text-[#555555]">รหัสพนักงาน</label>
              <input
                type="text"
                value={empId}
                onChange={(e) => setEmpId(e.target.value.toUpperCase())}
                placeholder="L2207014"
                className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:outline-none focus:border-[#DC2626] focus:ring-1 focus:ring-[#DC2626]"
                disabled={busy}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#555555]">Admin Email</label>
              <input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                placeholder="manager@company.com"
                className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:outline-none focus:border-[#DC2626] focus:ring-1 focus:ring-[#DC2626]"
                disabled={busy}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#555555]">Admin Password (ขั้นต่ำ 8 ตัว)</label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:outline-none focus:border-[#DC2626] focus:ring-1 focus:ring-[#DC2626]"
                disabled={busy}
              />
            </div>

            {error ? <p className="text-sm text-[#FCA5A5]">{error}</p> : null}
            {success ? <p className="text-sm text-[#86EFAC]">{success}</p> : null}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl bg-[#DC2626] px-5 py-2.5 font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.24)] transition hover:bg-[#991B1B] disabled:opacity-50 md:w-auto"
            >
              {busy ? "Saving..." : "บันทึกข้อมูล Admin Email"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
