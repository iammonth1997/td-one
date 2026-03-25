import { useState } from "react";
import { Form, redirect, useNavigate } from "react-router";
import type { Route } from "./+types/change-pin";
import prisma from "~/lib/prisma.server";
import { validateSession } from "~/lib/session-validation.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { session, error } = await validateSession(request, context);
  if (error || !session) {
    throw redirect("/login");
  }

  const user = await prisma.loginUser.findFirst({
    where: { emp_id: session.emp_id },
    select: { force_pin_change: true, must_change_password: true },
  });

  return {
    empId: session.emp_id,
    mustChangePassword: Boolean(user?.force_pin_change || user?.must_change_password),
  };
}

export default function ChangePasswordPage({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit() {
    if (loading) return;
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Password does not match.");
      return;
    }

    if (!loaderData.mustChangePassword && currentPassword.length < 1) {
      setError("Current password is required.");
      return;
    }

    if (newPassword.length < 12) {
      setError("New password must be at least 12 characters.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/login/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        if (data.error === "TEMP_PIN_EXPIRED") setError("Temporary password expired. Please contact HR.");
        else if (data.error === "INVALID_CURRENT_PIN") setError("Current password is incorrect.");
        else if (["INVALID_PIN_FORMAT", "PASSWORD_TOO_SHORT", "PASSWORD_TOO_LONG"].includes(String(data.error))) {
          setError("New password must be 12-128 characters.");
        } else if (data.error === "PASSWORD_TOO_SIMPLE") {
          setError("Password is too simple. Please use a stronger password.");
        } else if (data.error === "PASSWORD_CONTAINS_EMP_ID") {
          setError("Password must not contain your employee ID.");
        } else if (["PASSWORD_SAME_AS_PREVIOUS", "PASSWORD_RECENTLY_USED"].includes(String(data.error))) {
          setError("New password cannot be the same as recent passwords.");
        }
        else if (data.error === "MISSING_SESSION_TOKEN") navigate("/login");
        else setError("Unable to change password. Please try again.");
        return;
      }

      navigate("/dashboard", { replace: true });
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="px-4 pb-10 pt-4">
      {/*
        Profile layout (header/bottom nav come from `app/root.tsx`).
        We keep the existing change-password/PIN logic and handlers intact.
      */}

      <div className="mb-4 rounded-[20px] border border-black/[0.07] bg-white p-5 shadow-sm">
        <div className="text-center">
          <div className="mx-auto flex size-[72px] items-center justify-center rounded-[22px] bg-gradient-to-br from-[#450A0A] to-[#DC2626] shadow-[0_8px_24px_rgba(176,0,48,0.25)]">
            <span className="text-[26px] font-bold text-white">
              {loaderData.empId ? String(loaderData.empId).slice(0, 2).toUpperCase() : "พน"}
            </span>
          </div>

          <div className="mt-4 text-[18px] font-bold text-[#0D0D0D]">ชื่อพนักงาน</div>
          <div className="mt-1 text-[12px] text-[#9898AA]">พนักงาน · employee_portal</div>

          <div className="mt-3 flex flex-wrap justify-center gap-2">
            <span className="rounded-full border border-black/[0.07] bg-white px-3 py-1 text-[11px] font-semibold text-[#5A5A6B]">
              {loaderData.empId || "EMP"}
            </span>
            <span className="rounded-full border border-black/[0.07] bg-white px-3 py-1 text-[11px] font-semibold text-[#5A5A6B]">
              แผนกปฏิบัติการ
            </span>
            <span className="rounded-full border border-black/[0.07] bg-[#F4F4F6] px-3 py-1 text-[11px] font-semibold text-[#5A5A6B]">
              สถานะ: ปกติ
            </span>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.8px] text-[#9898AA]">ข้อมูลส่วนตัว</h2>
        <div className="overflow-hidden rounded-[16px] border border-black/[0.07] bg-white">
          <div className="flex items-center gap-3 border-b border-black/[0.07] px-4 py-3">
            <div className="w-[120px] shrink-0 text-[12px] font-semibold text-[#9898AA]">รหัสพนักงาน</div>
            <div className="flex-1 text-[13px] font-semibold text-[#0D0D0D]">{loaderData.empId || "-"}</div>
          </div>
          <div className="flex items-center gap-3 border-b border-black/[0.07] px-4 py-3">
            <div className="w-[120px] shrink-0 text-[12px] font-semibold text-[#9898AA]">บทบาท</div>
            <div className="flex-1 text-[13px] font-semibold text-[#0D0D0D]">employee</div>
          </div>
          <div className="flex items-center gap-3 border-b border-black/[0.07] px-4 py-3">
            <div className="w-[120px] shrink-0 text-[12px] font-semibold text-[#9898AA]">แผนก</div>
            <div className="flex-1 text-[13px] font-semibold text-[#0D0D0D]">ปฏิบัติการ</div>
          </div>
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-[120px] shrink-0 text-[12px] font-semibold text-[#9898AA]">วันเริ่มงาน</div>
            <div className="flex-1 text-[13px] font-semibold text-[#0D0D0D]">1 ม.ค. 2566</div>
          </div>
        </div>
      </div>

      <div className="mb-4">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-[0.8px] text-[#9898AA]">ตั้งค่า</h2>
        <div className="overflow-hidden rounded-[16px] border border-black/[0.07] bg-white">
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById("change-pin-form");
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className="flex cursor-pointer items-center gap-3 border-b border-black/[0.07] px-4 py-4 transition hover:bg-[#F4F4F6]"
          >
            <span className="flex size-[34px] items-center justify-center rounded-[10px] bg-[#FFF0F3]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D0002A" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </span>
            <span className="flex-1 text-[14px] font-semibold text-[#0D0D0D]">เปลี่ยน PIN</span>
            <svg className="shrink-0 text-[#9898AA]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>

          <button
            type="button"
            disabled
            className="flex cursor-not-allowed items-center gap-3 border-b border-black/[0.07] px-4 py-4 opacity-50"
          >
            <span className="flex size-[34px] items-center justify-center rounded-[10px] bg-[#EFF6FF]">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                <path d="M13.73 21a2 2 0 0 1-3.46 0" />
              </svg>
            </span>
            <span className="flex-1 text-[14px] font-semibold text-[#0D0D0D]">การแจ้งเตือน</span>
            <svg className="shrink-0 text-[#9898AA]" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>

        </div>
      </div>

      <div id="change-pin-form" className="mb-5 rounded-[16px] border border-black/[0.07] bg-white p-4 shadow-sm">
        <h2 className="mb-2 text-base font-bold text-[#0D0D0D]">เปลี่ยน PIN</h2>
        <p className="mb-4 text-sm text-[#9898AA]">
          {loaderData.mustChangePassword ? "กรุณาตั้งค่า PIN ใหม่ของคุณตอนนี้" : "กรอก PIN ปัจจุบันและ PIN ใหม่"}
        </p>

        {!loaderData.mustChangePassword ? (
          <>
            <label className="text-sm font-medium text-[#555555]">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
              disabled={loading}
            />
          </>
        ) : null}

        <label className="mt-4 block text-sm font-medium text-[#555555]">New Password</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          placeholder="12+ characters"
          disabled={loading}
        />
        <p className="mt-2 text-xs text-[#666666]">Min 12 characters. Use mix of letters, numbers, symbols.</p>

        <label className="mt-4 block text-sm font-medium text-[#555555]">Confirm Password</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white p-2.5 text-[#111111] placeholder:text-[#777777] focus:border-[#DC2626] focus:outline-none focus:ring-1 focus:ring-[#DC2626]"
          placeholder="Confirm password"
          disabled={loading}
        />

        {error ? <p className="mt-3 text-center text-sm text-red-600">{error}</p> : null}

        <button
          type="button"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={loading}
          className="mt-3 w-full rounded-xl bg-[#DC2626] py-2.5 font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.25)] transition hover:bg-[#991B1B] disabled:opacity-50"
        >
          {loading ? "Saving..." : "Save Password"}
        </button>
      </div>

      <Form method="post" action="/dashboard">
        <button
          type="submit"
          className="w-full rounded-xl border border-[#FECDD6] bg-[#FFF0F3] px-4 py-3 text-[14px] font-bold text-[#D0002A] transition active:opacity-90"
        >
          ออกจากระบบ
        </button>
      </Form>
    </div>
  );
}
