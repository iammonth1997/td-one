"use client";

import { useLanguage } from "@/app/context/LanguageContext";
import LanguageSwitcher from "@/app/components/LanguageSwitcher";
import { useSession } from "@/app/hooks/useSession";

export default function Header({ portal = "employee_portal", loginPath = "/login" }) {
  const { session, logout } = useSession({ requiredPortal: portal, loginPath });
  const { t } = useLanguage();
  const L = t.header;

  const empId = session?.emp_id || session?.user?.emp_id || null;

  return (
    <div className="flex w-full items-center justify-between border-b border-[#FECACA] bg-white/95 px-6 py-3 shadow-[0_8px_24px_rgba(220,38,38,0.12)] backdrop-blur-sm">
      <div>
        <h2 className="text-xl font-bold text-[#111111]">{L.dashboard}</h2>
        {empId && <div className="text-sm text-[#555555]">{empId}</div>}
      </div>

      <div className="flex items-center gap-3">
        <LanguageSwitcher />
        <button
          className="rounded-xl bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#991B1B] shadow-[0_10px_20px_rgba(220,38,38,0.22)]"
          onClick={logout}
        >
          {L.logout}
        </button>
      </div>
    </div>
  );
}
