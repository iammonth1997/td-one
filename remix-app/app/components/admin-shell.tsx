import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";

type AdminShellProps = {
  title: string;
  session: {
    emp_id: string;
    role: string;
  };
  children: ReactNode;
};

const NAV_GROUPS = [
  {
    title: "OVERVIEW",
    items: [{ label: "Dashboard", href: "/admin/dashboard" }],
  },
  {
    title: "PEOPLE",
    items: [
      { label: "Employees", href: "/admin/employees" },
      { label: "Attendance", href: "/admin/attendance" },
      { label: "Requests", href: "/admin/requests" },
      { label: "Recruitment", href: "/admin/recruitment" },
      { label: "HR-ER", href: "/admin/hr-er" },
    ],
  },
  {
    title: "PAYROLL",
    items: [
      { label: "Salary Run", href: "/admin/payroll/salary" },
      { label: "OT Run", href: "/admin/payroll/ot" },
      { label: "Pay Slips", href: "/admin/payroll/slips" },
      { label: "History", href: "/admin/payroll/history" },
    ],
  },
  {
    title: "SECURITY",
    items: [
      { label: "Devices", href: "/admin/devices" },
      { label: "Audit Logs", href: "/admin/audit" },
    ],
  },
  {
    title: "SETTINGS",
    items: [
      { label: "Work Sites", href: "/admin/work-locations" },
      { label: "Pay Policy", href: "/admin/pay-policies" },
      { label: "Shifts", href: "/admin/shifts" },
      { label: "Deductions", href: "/admin/settings/deductions" },
      { label: "Admin Accs", href: "/admin/settings/admins" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminShell({ title, session, children }: AdminShellProps) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-[#f2f4f8] text-[#111111]">
      <aside className="fixed left-0 top-0 z-30 h-screen w-[240px] border-r border-[#2C3C52] bg-[#1A2332] text-[#D7E3F4]">
        <div className="h-16 border-b border-[#2C3C52] px-4 flex items-center">
          <p className="text-sm font-semibold tracking-wide text-white">ADMIN PANEL</p>
        </div>

        <nav className="h-[calc(100vh-4rem)] overflow-y-auto px-2 py-3">
          {NAV_GROUPS.map((group) => (
            <div key={group.title} className="mb-5">
              <p className="px-2 pb-2 text-[11px] font-semibold tracking-wider text-[#8DA2C2]">{group.title}</p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const active = isActive(location.pathname, item.href);
                  return (
                    <Link
                      key={`${group.title}-${item.label}`}
                      to={item.href}
                      className={`group relative flex items-center rounded-md px-2 py-2 text-sm transition-colors ${
                        active ? "bg-[#243349] text-white" : "text-[#C7D6EB] hover:bg-[#223247] hover:text-white"
                      }`}
                    >
                      {active && <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r bg-[#5AA0FF]" />}
                      <span className="truncate">{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>
      </aside>

      <div className="ml-[240px]">
        <header className="sticky top-0 z-20 h-16 border-b border-[#d8dee8] bg-white/95 backdrop-blur px-4">
          <div className="flex h-full items-center justify-between">
            <div>
              <p className="text-xs text-[#8694aa]">TD One ERP</p>
              <h1 className="text-xl font-semibold text-[#1b2738]">{title}</h1>
            </div>
            <div className="flex items-center gap-3 text-xs text-[#55657d]">
              <span>{session.emp_id}</span>
              <span className="rounded-full bg-[#1d2b40] px-2 py-1 text-[10px] font-bold text-white">{session.role}</span>
            </div>
          </div>
        </header>

        <main className="p-4">{children}</main>
      </div>
    </div>
  );
}
