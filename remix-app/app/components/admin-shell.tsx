import type { ReactNode } from "react";
import { Form, Link, useLocation } from "react-router";

import { LanguageSwitcher } from "~/components/language-switcher";
import { useI18n } from "~/lib/i18n";

type AdminShellProps = {
  title: string;
  session: {
    emp_id: string;
    role: string | null;
  };
  children: ReactNode;
};

type NavItem = {
  label: string;
  href: string;
  match?: "exact" | "prefix";
};

type NavGroup = {
  title: string;
  accentClassName: string;
  items: NavItem[];
};

const NAV_GROUPS = [
  {
    title: "OVERVIEW",
    accentClassName: "bg-sky-400",
    items: [{ label: "Dashboard", href: "/admin/dashboard" }],
  },
  {
    title: "PEOPLE",
    accentClassName: "bg-emerald-400",
    items: [
      { label: "Employees", href: "/admin/employees" },
      { label: "Attendance", href: "/admin/attendance" },
      { label: "Requests", href: "/admin/requests", match: "exact" as const },
      { label: "Create request", href: "/admin/requests/new" },
      { label: "Recruitment", href: "/admin/recruitment" },
      { label: "HR-ER", href: "/admin/hr-er" },
    ],
  },
  {
    title: "PAYROLL",
    accentClassName: "bg-amber-400",
    items: [
      { label: "Salary Run", href: "/admin/payroll/salary" },
      { label: "OT Run", href: "/admin/payroll/ot" },
      { label: "Pay Slips", href: "/admin/payroll/slips" },
      { label: "History", href: "/admin/payroll/history" },
    ],
  },
  {
    title: "SECURITY",
    accentClassName: "bg-rose-400",
    items: [
      { label: "Devices", href: "/admin/devices" },
      { label: "Audit Logs", href: "/admin/audit" },
    ],
  },
  {
    title: "SETTINGS",
    accentClassName: "bg-violet-400",
    items: [
      { label: "Work Sites", href: "/admin/work-locations" },
      { label: "Pay Policy", href: "/admin/pay-policies" },
      { label: "Shifts", href: "/admin/shifts" },
      { label: "Deductions", href: "/admin/settings/deductions" },
      { label: "Admin Accs", href: "/admin/settings/admins" },
    ],
  },
] satisfies NavGroup[];

function isActive(pathname: string, href: string, match: "exact" | "prefix" = "prefix") {
  if (match === "exact") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminShell({ title, session, children }: AdminShellProps) {
  const location = useLocation();
  const { tLiteral } = useI18n();
  const sidebarWidth = 240;

  return (
    <div className="min-h-screen bg-[#f2f4f8] text-[#111111]">
      <aside
        className="fixed left-0 top-0 z-30 h-screen border-r"
        style={{ width: `${sidebarWidth}px`, borderColor: "#2C3C52", backgroundColor: "#1A2332", color: "#D7E3F4" }}
      >
        <div className="flex h-16 items-center border-b px-4" style={{ borderColor: "#2C3C52" }}>
          <p className="text-sm font-semibold tracking-wide text-white">{tLiteral("ADMIN PANEL")}</p>
        </div>

        <nav className="h-[calc(100vh-4rem)] overflow-y-auto px-3 py-4">
          <div className="space-y-3">
            {NAV_GROUPS.map((group) => {
              const activeGroup = group.items.some((item) => isActive(location.pathname, item.href, item.match));

              return (
                <section
                  key={group.title}
                  className={`rounded-2xl border transition-colors ${
                    activeGroup
                      ? "border-[#3a4f6e] bg-[#202c3e] shadow-[0_8px_24px_rgba(6,14,28,0.22)]"
                      : "border-[#2A374A] bg-[#1D2939]"
                  }`}
                >
                  <div className="px-3 pb-2 pt-3">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${group.accentClassName}`} />
                      <p className="text-[11px] font-semibold tracking-[0.16em] text-[#9CB0CE]">{tLiteral(group.title)}</p>
                    </div>
                    <div className="mt-3 h-px bg-[#2F4057]" />
                  </div>

                  <div className="px-2 pb-2">
                    <div className="relative pl-3">
                      <span className="absolute bottom-1 left-0 top-1 w-px rounded-full bg-[#314156]" />
                      <div className="space-y-1">
                {group.items.map((item) => {
                  const active = isActive(location.pathname, item.href, item.match);
                  return (
                    <Link
                      key={`${group.title}-${item.label}`}
                      to={item.href}
                      className={`group relative flex items-center rounded-xl px-3 py-2.5 text-sm transition-colors ${
                        active
                          ? "bg-[#2B3B54] text-white shadow-[inset_0_0_0_1px_rgba(112,166,255,0.14)]"
                          : "text-[#C7D6EB] hover:bg-[#223247] hover:text-white"
                      }`}
                    >
                      <span
                        className={`absolute left-[-0.78rem] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full border ${
                          active
                            ? "border-[#9CC9FF] bg-[#5AA0FF] shadow-[0_0_0_4px_rgba(90,160,255,0.14)]"
                            : "border-[#52667F] bg-[#1D2939] group-hover:border-[#7FAEE5]"
                        }`}
                      />
                      <span className="truncate">{tLiteral(item.label)}</span>
                    </Link>
                  );
                })}
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </nav>
      </aside>

      <div style={{ marginLeft: `${sidebarWidth}px` }}>
        <header className="sticky top-0 z-20 h-16 border-b border-[#d8dee8] bg-white/95 backdrop-blur px-4">
          <div className="flex h-full items-center justify-between">
            <div>
              <p className="text-xs text-[#8694aa]">{tLiteral("TD One ERP")}</p>
              <h1 className="text-xl font-semibold text-[#1b2738]">{tLiteral(title)}</h1>
            </div>
            <div className="flex items-center gap-3 text-xs text-[#55657d]">
              <Form action="/admin/logout" method="post">
                <button
                  type="submit"
                  className="rounded-md border border-[#d8dee8] bg-white px-3 py-1.5 text-xs font-semibold text-[#1d2b40] transition hover:bg-[#f2f4f8]"
                >
                  {tLiteral("Logout")}
                </button>
              </Form>
              <LanguageSwitcher
                className="flex shrink-0 gap-[3px]"
                activeClassName="border-transparent bg-[#1d2b40] text-white"
                idleClassName="border-[#d8dee8] bg-white text-[#5b6d85]"
              />
              <span data-i18n-skip="true">{session.emp_id}</span>
              <span data-i18n-skip="true" className="rounded-full bg-[#1d2b40] px-2 py-1 text-[10px] font-bold text-white">
                {session.role}
              </span>
            </div>
          </div>
        </header>

        <main className="p-4">{children}</main>
      </div>
    </div>
  );
}
