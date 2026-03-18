"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import Header from "@/app/components/Header";
import { useSession } from "@/app/hooks/useSession";

const ADMIN_ACTIONS = [
  {
    title: "อนุมัติคำขอ",
    description: "จัดการคำขอลา/OT/แก้เวลา",
    href: "/request",
  },
  {
    title: "จัดการสถานที่ทำงาน",
    description: "เพิ่ม/แก้ไขพิกัดและรัศมีสแกน",
    href: "/admin/work-locations",
  },
  {
    title: "PIN Reset Audit",
    description: "ตรวจสอบและออก PIN ชั่วคราว",
    href: "/admin/pin-reset-audit",
  },
  {
    title: "Device Binding",
    description: "รีเซ็ตอุปกรณ์ผูกบัญชี",
    href: "/admin/device-binding",
  },
  {
    title: "Admin Email Accounts",
    description: "ตั้งค่า/รีเซ็ตรหัสผ่านสำหรับเข้า Admin Portal",
    href: "/admin/account",
  },
  {
    title: "Change My Admin Password",
    description: "เปลี่ยนรหัสผ่าน Admin ของบัญชีที่ล็อกอินอยู่",
    href: "/admin/change-password",
  },
];

export default function AdminHomePage() {
  const router = useRouter();
  const { session, loading } = useSession({
    loginPath: "/admin/login",
    requiredPortal: "admin_portal",
  });

  const role = useMemo(() => session?.role || "-", [session?.role]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-[#111111]">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-[#111111]">
      <Header portal="admin_portal" loginPath="/admin/login" />

      <div className="max-w-6xl mx-auto p-6">
        <div className="rounded-[1rem] border border-[#FECACA] bg-gradient-to-br from-[#450A0A] via-[#991B1B] to-[#DC2626] p-6 text-white shadow-[0_12px_32px_rgba(220,38,38,0.16)]">
          <p className="text-sm text-white/80">Admin Portal</p>
          <h1 className="mt-1 text-2xl font-bold">ระบบบริหาร</h1>
          <p className="mt-2 text-sm text-white/80">รหัสพนักงาน: {session.emp_id} • role: {role}</p>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {ADMIN_ACTIONS.map((item) => (
            <button
              key={item.href}
              type="button"
              onClick={() => router.push(item.href)}
              className="rounded-[1rem] border border-[#FECACA] bg-white p-5 text-left shadow-[0_10px_28px_rgba(220,38,38,0.10)] transition hover:-translate-y-0.5 hover:border-[#DC2626]/50 hover:shadow-[0_16px_36px_rgba(220,38,38,0.16)]"
            >
              <h2 className="text-lg font-bold text-[#111111]">{item.title}</h2>
              <p className="mt-1 text-sm text-[#555555]">{item.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
