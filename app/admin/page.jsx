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
      <div className="flex items-center justify-center min-h-screen bg-[#F5F7FA] text-[#1A2B4A]">
        Loading...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-[#1A2B4A]">
      <Header />

      <div className="max-w-6xl mx-auto p-6">
        <div className="rounded-2xl bg-gradient-to-br from-[#0D3B7A] via-[#1352A3] to-[#1E6CC8] p-6 text-white shadow-[0_8px_32px_rgba(13,59,122,0.20)]">
          <p className="text-white/80 text-sm">Admin Portal</p>
          <h1 className="text-2xl font-bold mt-1">ระบบบริหาร</h1>
          <p className="text-sm text-white/80 mt-2">รหัสพนักงาน: {session.emp_id} • role: {role}</p>
        </div>

        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {ADMIN_ACTIONS.map((item) => (
            <button
              key={item.href}
              type="button"
              onClick={() => router.push(item.href)}
              className="bg-white rounded-xl border border-[#D0D8E4] p-5 text-left shadow-[0_2px_12px_rgba(13,59,122,0.06)] hover:shadow-[0_8px_24px_rgba(13,59,122,0.14)] transition"
            >
              <h2 className="text-lg font-bold text-[#1A2B4A]">{item.title}</h2>
              <p className="text-sm text-[#6B7A99] mt-1">{item.description}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
