"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLanguage } from "@/app/context/LanguageContext";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { readStoredSession } from "@/lib/clientSession";

export default function Sidebar() {
  const [session] = useState(() => {
    if (typeof window === "undefined") return null;
    try {
      return readStoredSession("employee_portal");
    } catch (err) {
      console.error("Sidebar: failed to parse session", err);
      return null;
    }
  });
  const { t } = useLanguage();
  const L = t.sidebar;

  const role = session?.role || "employee";
  const normalizedRole = String(role || "").trim().toLowerCase();
  const isEmployee = normalizedRole === "employee";

  const accessProfile = useMemo(() => buildSessionAccessProfile(session || {}), [session]);
  const visibleMenus = useMemo(() => new Set(accessProfile?.visibleMenus || []), [accessProfile]);
  const hasRbacMenus = visibleMenus.size > 0;

  function canShow(menuIds, fallback = true) {
    if (!hasRbacMenus) return fallback;
    return menuIds.some((menuId) => visibleMenus.has(menuId));
  }

  return (
    <aside className="bg-[#082A5C] border-r border-[#0D3B7A] w-64 h-screen p-6 flex flex-col">
      <Link href="/dashboard" className="text-2xl font-bold text-white mb-10 block tracking-wide">
        TD One ERP
      </Link>

      <nav className="flex flex-col gap-1">
        {canShow(["dashboard"], true) && (
          <Link href="/dashboard" className="px-3 py-2.5 rounded-lg text-[#E8F0FB] hover:bg-[#0D3B7A] hover:text-white transition text-sm font-medium">{L.dashboard}</Link>
        )}
        {canShow(["attendance", "clock", "history"], !isEmployee) && (
          <Link href="/attendance" className="px-3 py-2.5 rounded-lg text-[#E8F0FB] hover:bg-[#0D3B7A] hover:text-white transition text-sm font-medium">{L.attendance}</Link>
        )}
        {canShow(["leave", "approvals"], true) && (
          <Link href="/request" className="px-3 py-2.5 rounded-lg text-[#E8F0FB] hover:bg-[#0D3B7A] hover:text-white transition text-sm font-medium">{L.request}</Link>
        )}
        {canShow(["payroll"], !isEmployee) && (
          <Link href="/payroll" className="px-3 py-2.5 rounded-lg text-[#E8F0FB] hover:bg-[#0D3B7A] hover:text-white transition text-sm font-medium">{L.payroll}</Link>
        )}
        {canShow(["settings", "rbac"], !isEmployee) && (
          <Link href="/admin/pin-reset-audit" className="px-3 py-2.5 rounded-lg text-[#E8F0FB] hover:bg-[#0D3B7A] hover:text-white transition text-sm font-medium">{L.pinResetAudit}</Link>
        )}
        {canShow(["settings", "rbac"], !isEmployee) && (
          <Link href="/admin/work-locations" className="px-3 py-2.5 rounded-lg text-[#E8F0FB] hover:bg-[#0D3B7A] hover:text-white transition text-sm font-medium">{L.workLocations}</Link>
        )}
        {canShow(["settings", "rbac"], !isEmployee) && (
          <Link href="/admin/device-binding" className="px-3 py-2.5 rounded-lg text-[#E8F0FB] hover:bg-[#0D3B7A] hover:text-white transition text-sm font-medium">{L.deviceBinding}</Link>
        )}
        {canShow(["payslip"], true) && (
          <Link href="/slip" className="px-3 py-2.5 rounded-lg text-[#E8F0FB] hover:bg-[#0D3B7A] hover:text-white transition text-sm font-medium">{L.mySlip}</Link>
        )}
      </nav>

      <div className="mt-auto text-sm text-[#E8F0FB] opacity-80">
        {L.loggedInAs}
        <div className="text-white font-semibold">{session?.emp_id || '-'}</div>
      </div>
    </aside>
  );
}
