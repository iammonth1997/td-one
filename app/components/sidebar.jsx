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
    <aside className="flex h-screen w-64 flex-col border-r border-[#FECACA] bg-white p-6 text-[#111111]">
      <Link href="/dashboard" className="mb-10 block text-2xl font-bold tracking-wide text-[#DC2626]">
        TD One ERP
      </Link>

      <nav className="flex flex-col gap-1">
        {canShow(["dashboard"], true) && (
          <Link href="/dashboard" className="rounded-xl px-3 py-2.5 text-sm font-medium text-[#444444] transition hover:bg-[#FEF2F2] hover:text-[#DC2626]">{L.dashboard}</Link>
        )}
        {canShow(["attendance", "clock", "history"], !isEmployee) && (
          <Link href="/attendance" className="rounded-xl px-3 py-2.5 text-sm font-medium text-[#444444] transition hover:bg-[#FEF2F2] hover:text-[#DC2626]">{L.attendance}</Link>
        )}
        {canShow(["leave", "approvals"], true) && (
          <Link href="/request" className="rounded-xl px-3 py-2.5 text-sm font-medium text-[#444444] transition hover:bg-[#FEF2F2] hover:text-[#DC2626]">{L.request}</Link>
        )}
        {canShow(["payroll"], !isEmployee) && (
          <Link href="/payroll" className="rounded-xl px-3 py-2.5 text-sm font-medium text-[#444444] transition hover:bg-[#FEF2F2] hover:text-[#DC2626]">{L.payroll}</Link>
        )}
        {canShow(["settings", "rbac"], !isEmployee) && (
          <Link href="/admin/pin-reset-audit" className="rounded-xl px-3 py-2.5 text-sm font-medium text-[#444444] transition hover:bg-[#FEF2F2] hover:text-[#DC2626]">{L.pinResetAudit}</Link>
        )}
        {canShow(["settings", "rbac"], !isEmployee) && (
          <Link href="/admin/work-locations" className="rounded-xl px-3 py-2.5 text-sm font-medium text-[#444444] transition hover:bg-[#FEF2F2] hover:text-[#DC2626]">{L.workLocations}</Link>
        )}
        {canShow(["settings", "rbac"], !isEmployee) && (
          <Link href="/admin/device-binding" className="rounded-xl px-3 py-2.5 text-sm font-medium text-[#444444] transition hover:bg-[#FEF2F2] hover:text-[#DC2626]">{L.deviceBinding}</Link>
        )}
        {canShow(["payslip"], true) && (
          <Link href="/slip" className="rounded-xl px-3 py-2.5 text-sm font-medium text-[#444444] transition hover:bg-[#FEF2F2] hover:text-[#DC2626]">{L.mySlip}</Link>
        )}
      </nav>

      <div className="mt-auto rounded-2xl border border-[#FECACA] bg-[#FEF2F2] p-4 text-sm text-[#555555] shadow-[0_10px_24px_rgba(220,38,38,0.08)]">
        {L.loggedInAs}
        <div className="font-semibold text-[#111111]">{session?.emp_id || '-'}</div>
      </div>
    </aside>
  );
}
