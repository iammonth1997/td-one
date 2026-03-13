"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/Header";
import { useSession } from "@/app/hooks/useSession";

export default function AdminChangePasswordPage() {
  const router = useRouter();
  const { session, loading, getAuthHeaders } = useSession({
    loginPath: "/admin/login",
    requiredPortal: "admin_portal",
  });

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
      const res = await fetch("/api/admin/account/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword,
          confirm_password: confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.error === "INVALID_OLD_PASSWORD") setError("รหัสผ่านเดิมไม่ถูกต้อง");
        else if (data.error === "PASSWORD_MISMATCH") setError("รหัสผ่านใหม่และยืนยันรหัสผ่านไม่ตรงกัน");
        else if (data.error === "WEAK_PASSWORD") setError("รหัสผ่านใหม่ต้องมีอย่างน้อย 8 ตัวอักษร");
        else if (data.error === "PASSWORD_UNCHANGED") setError("รหัสผ่านใหม่ต้องไม่ซ้ำรหัสเดิม");
        else if (data.error === "FORBIDDEN_PORTAL_CONTEXT") setError("ต้องเข้าสู่ระบบผ่าน Admin Portal");
        else setError("เปลี่ยนรหัสผ่านไม่สำเร็จ");
        return;
      }

      if (data.revoked_other_sessions) {
        setSuccess("เปลี่ยนรหัสผ่านสำเร็จ และออกจากระบบอุปกรณ์อื่นทั้งหมดแล้ว");
      } else {
        setSuccess("เปลี่ยนรหัสผ่านสำเร็จ");
      }
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
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
      <Header portal="admin_portal" loginPath="/admin/login" />

      <div className="max-w-2xl mx-auto p-6">
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
          <h1 className="text-2xl font-bold">เปลี่ยนรหัสผ่าน Admin</h1>
          <p className="text-sm text-[#6B7A99] mt-1">บัญชี: {session.emp_id}</p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="text-sm font-medium text-[#334260]">รหัสผ่านเดิม</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="w-full mt-1 p-2.5 rounded-lg bg-[#F5F7FA] text-[#1A2B4A] border border-[#D0D8E4] focus:outline-none focus:border-[#1352A3] focus:ring-1 focus:ring-[#1352A3]"
                disabled={busy}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#334260]">รหัสผ่านใหม่ (ขั้นต่ำ 8 ตัว)</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full mt-1 p-2.5 rounded-lg bg-[#F5F7FA] text-[#1A2B4A] border border-[#D0D8E4] focus:outline-none focus:border-[#1352A3] focus:ring-1 focus:ring-[#1352A3]"
                disabled={busy}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#334260]">ยืนยันรหัสผ่านใหม่</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
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
              {busy ? "Saving..." : "บันทึกรหัสผ่านใหม่"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
