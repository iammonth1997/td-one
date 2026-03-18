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
      <div className="flex min-h-screen items-center justify-center bg-white text-[#555555]">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-[#111111]">
      <Header portal="admin_portal" loginPath="/admin/login" />

      <div className="max-w-2xl mx-auto p-6">
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
          <h1 className="text-2xl font-bold">เปลี่ยนรหัสผ่าน Admin</h1>
          <p className="mt-1 text-sm text-[#777777]">บัญชี: {session.emp_id}</p>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <div>
              <label className="text-sm font-medium text-[#555555]">รหัสผ่านเดิม</label>
              <input
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] focus:outline-none focus:border-[#DC2626] focus:ring-1 focus:ring-[#DC2626]"
                disabled={busy}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#555555]">รหัสผ่านใหม่ (ขั้นต่ำ 8 ตัว)</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] focus:outline-none focus:border-[#DC2626] focus:ring-1 focus:ring-[#DC2626]"
                disabled={busy}
              />
            </div>

            <div>
              <label className="text-sm font-medium text-[#555555]">ยืนยันรหัสผ่านใหม่</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] focus:outline-none focus:border-[#DC2626] focus:ring-1 focus:ring-[#DC2626]"
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
              {busy ? "Saving..." : "บันทึกรหัสผ่านใหม่"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
