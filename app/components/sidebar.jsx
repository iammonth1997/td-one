"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/app/context/LanguageContext";

export default function Sidebar() {
  const [session, setSession] = useState(null);
  const { t } = useLanguage();
  const L = t.sidebar;

  useEffect(() => {
    try {
      const s = localStorage.getItem("tdone_session");
      if (s) setSession(JSON.parse(s));
    } catch (err) {
      console.error("Sidebar: failed to parse session", err);
    }
  }, []);

  const role = session?.role || "employee";
  const isEmployee = role === "employee";

  return (
    <aside className="bg-[#082A5C] border-r border-[#0D3B7A] w-64 h-screen p-6 flex flex-col">
      <Link href="/dashboard" className="text-2xl font-bold text-white mb-10 block tracking-wide">
        TD One ERP
      </Link>

      <nav className="flex flex-col gap-1">
        <Link href="/dashboard" className="px-3 py-2.5 rounded-lg text-[#E8F0FB] hover:bg-[#0D3B7A] hover:text-white transition text-sm font-medium">{L.dashboard}</Link>
        {!isEmployee && (
          <Link href="/attendance" className="px-3 py-2.5 rounded-lg text-[#E8F0FB] hover:bg-[#0D3B7A] hover:text-white transition text-sm font-medium">{L.attendance}</Link>
        )}
        <Link href="/request" className="px-3 py-2.5 rounded-lg text-[#E8F0FB] hover:bg-[#0D3B7A] hover:text-white transition text-sm font-medium">{L.request}</Link>
        {!isEmployee && (
          <Link href="/payroll" className="px-3 py-2.5 rounded-lg text-[#E8F0FB] hover:bg-[#0D3B7A] hover:text-white transition text-sm font-medium">{L.payroll}</Link>
        )}
        {!isEmployee && (
          <Link href="/admin/pin-reset-audit" className="px-3 py-2.5 rounded-lg text-[#E8F0FB] hover:bg-[#0D3B7A] hover:text-white transition text-sm font-medium">{L.pinResetAudit}</Link>
        )}
        {!isEmployee && (
          <Link href="/admin/work-locations" className="px-3 py-2.5 rounded-lg text-[#E8F0FB] hover:bg-[#0D3B7A] hover:text-white transition text-sm font-medium">{L.workLocations}</Link>
        )}
        {!isEmployee && (
          <Link href="/admin/device-binding" className="px-3 py-2.5 rounded-lg text-[#E8F0FB] hover:bg-[#0D3B7A] hover:text-white transition text-sm font-medium">{L.deviceBinding}</Link>
        )}
        {!isEmployee && (
          <Link href="/admin/line-rich-menu" className="px-3 py-2.5 rounded-lg text-[#E8F0FB] hover:bg-[#0D3B7A] hover:text-white transition text-sm font-medium">{L.lineRichMenu || "LINE Rich Menu"}</Link>
        )}
        <Link href="/slip" className="px-3 py-2.5 rounded-lg text-[#E8F0FB] hover:bg-[#0D3B7A] hover:text-white transition text-sm font-medium">{L.mySlip}</Link>
      </nav>

      <div className="mt-auto text-sm text-[#E8F0FB] opacity-80">
        {L.loggedInAs}
        <div className="text-white font-semibold">{session?.emp_id || '-'}</div>
      </div>
    </aside>
  );
}
