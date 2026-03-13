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
    <div className="w-full bg-white border-b border-[#D0D8E4] px-6 py-3 flex justify-between items-center shadow-[0_2px_12px_rgba(13,59,122,0.12)]">
      <div>
        <h2 className="text-xl font-bold text-[#1A2B4A]">{L.dashboard}</h2>
        {empId && <div className="text-sm text-[#6B7A99]">{empId}</div>}
      </div>

      <div className="flex items-center gap-3">
        <LanguageSwitcher />
        <button
          className="bg-[#1352A3] hover:bg-[#0D3B7A] text-white px-4 py-2 rounded-lg text-sm font-semibold transition"
          onClick={logout}
        >
          {L.logout}
        </button>
      </div>
    </div>
  );
}
