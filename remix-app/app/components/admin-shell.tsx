import { useEffect, useState, type ComponentType, type ReactNode } from "react";
import {
  Briefcase,
  Calendar,
  ChevronLeft,
  Clock,
  FilePlus,
  FileText,
  History,
  KeyRound,
  LayoutDashboard,
  Receipt,
  ScrollText,
  Smartphone,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import { Form, Link, useLocation } from "react-router";

import TdOneLogo from "~/components/TdOneLogo";
import { LanguageSwitcher } from "~/components/language-switcher";
import { useI18n } from "~/lib/i18n";
import { canAccessAdminPath, canViewAdminSidebarGroup, type AdminSidebarGroupKey } from "~/lib/role-access";

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
  icon?: ComponentType<{ className?: string; size?: number; strokeWidth?: number; "aria-hidden"?: boolean }>;
};

type NavGroup = {
  key: AdminSidebarGroupKey;
  title: string;
  accentClassName: string;
  items: NavItem[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    key: "overview",
    title: "OVERVIEW",
    accentClassName: "bg-sky-400",
    items: [{ label: "Dashboard", href: "/admin/dashboard", icon: LayoutDashboard }],
  },
  {
    key: "hr",
    title: "HR",
    accentClassName: "bg-emerald-400",
    items: [
      { label: "Employees", href: "/admin/employees", icon: Users },
      { label: "Attendance", href: "/admin/attendance", icon: Calendar },
      { label: "Recruitment", href: "/admin/recruitment", icon: UserPlus },
      { label: "HR-ER", href: "/admin/hr-er", icon: Briefcase },
    ],
  },
  {
    key: "workflow",
    title: "WORKFLOW",
    accentClassName: "bg-cyan-400",
    items: [
      { label: "Requests", href: "/admin/requests", match: "exact" as const, icon: FileText },
      { label: "Create request", href: "/admin/requests/new", icon: FilePlus },
    ],
  },
  {
    key: "payroll",
    title: "PAYROLL",
    accentClassName: "bg-amber-400",
    items: [
      { label: "Salary Run", href: "/admin/payroll/salary", icon: Wallet },
      { label: "OT Run", href: "/admin/payroll/ot", icon: Clock },
      { label: "Pay Slips", href: "/admin/payroll/slips", icon: Receipt },
      { label: "History", href: "/admin/payroll/history", icon: History },
    ],
  },
  {
    key: "security",
    title: "SECURITY",
    accentClassName: "bg-rose-400",
    items: [
      { label: "Devices", href: "/admin/devices", icon: Smartphone },
      { label: "Audit Logs", href: "/admin/audit", icon: ScrollText },
      { label: "Reset Password", href: "/forgot-password", icon: KeyRound },
    ],
  },
  {
    key: "settings",
    title: "SETTINGS",
    accentClassName: "bg-violet-400",
    items: [
      { label: "Work Sites", href: "/admin/work-locations", icon: Briefcase },
      { label: "Pay Policy", href: "/admin/pay-policies", icon: Wallet },
      { label: "Shifts", href: "/admin/shifts", icon: Clock },
      { label: "Deductions", href: "/admin/settings/deductions", icon: Receipt },
      { label: "Admin Accs", href: "/admin/settings/admins", icon: Users },
    ],
  },
];

const SIDEBAR_EXPANDED_WIDTH = 240;
const SIDEBAR_COLLAPSED_WIDTH = 64;
const SIDEBAR_STORAGE_KEY = "td-one-sidebar-collapsed";

function isActive(pathname: string, href: string, match: "exact" | "prefix" = "prefix") {
  if (match === "exact") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminShell({ title, session, children }: AdminShellProps) {
  const location = useLocation();
  const { tLiteral } = useI18n();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarPreferenceLoaded, setSidebarPreferenceLoaded] = useState(false);
  const sidebarWidth = sidebarCollapsed ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;
  const visibleNavGroups = NAV_GROUPS.filter((group) => canViewAdminSidebarGroup(session.role, group.key))
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessAdminPath(session.role, item.href)),
    }))
    .filter((group) => group.items.length > 0);

  useEffect(() => {
    const savedValue = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);

    if (savedValue === "true") {
      setSidebarCollapsed(true);
    } else if (savedValue === "false") {
      setSidebarCollapsed(false);
    }

    setSidebarPreferenceLoaded(true);
  }, []);

  useEffect(() => {
    if (!sidebarPreferenceLoaded) {
      return;
    }

    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed, sidebarPreferenceLoaded]);

  return (
    <div className="min-h-screen bg-[#f2f4f8] text-[#111111]">
      <style>
        {`
          .td-admin-sidebar > div:first-of-type {
            box-sizing: border-box;
            overflow: hidden;
            transition: padding 250ms ease, gap 250ms ease;
          }

          .td-admin-sidebar--collapsed > div:first-of-type {
            align-items: center !important;
            display: flex !important;
            gap: 0 !important;
            justify-content: center !important;
            padding: 16px 11px !important;
          }

          .td-admin-sidebar--collapsed > div:first-of-type > div:nth-of-type(2) {
            display: none !important;
          }
        `}
      </style>
      <aside
        className={`td-admin-sidebar ${
          sidebarCollapsed ? "td-admin-sidebar--collapsed" : ""
        } fixed left-0 top-0 z-30 flex h-dvh flex-col transition-[width] duration-[250ms] ease-in-out`}
        style={{ width: `${sidebarWidth}px`, borderRight: "0.5px solid #2a2724", backgroundColor: "#1c1917", color: "#fafaf9" }}
      >
        <TdOneLogo />

        <button
          type="button"
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={() => setSidebarCollapsed((current) => !current)}
          className="absolute right-0 top-1/2 z-10 flex h-7 w-7 translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-[#3a3633] bg-[#1c1917] text-[#fafaf9] shadow-[0_8px_18px_rgba(0,0,0,0.28)] transition-[background-color,transform] duration-[250ms] ease-in-out hover:scale-105 hover:bg-[#2a2724]"
        >
          <ChevronLeft
            className={`h-4 w-4 transition-transform duration-[250ms] ease-in-out ${sidebarCollapsed ? "rotate-180" : ""}`}
            aria-hidden
          />
        </button>

        <nav className="min-h-0 flex-1 overflow-x-visible overflow-y-auto overscroll-contain px-3 pb-4 pt-0 [scrollbar-gutter:stable] [-webkit-overflow-scrolling:touch]">
          <div className="space-y-2">
            {visibleNavGroups.map((group) => {
              return (
                <section key={group.title} className="py-2">
                  {sidebarCollapsed ? (
                    <div style={{ height: "1px", background: "#3a3633", margin: "12px 16px", opacity: 0.5 }} />
                  ) : (
                    <div className="px-4 pb-2 pt-3">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-[#fafaf9] opacity-60" />
                        <p className="text-[11px] font-medium uppercase tracking-[2px] text-[#a8a29e]">{tLiteral(group.title)}</p>
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    {group.items.map((item) => {
                      const active = isActive(location.pathname, item.href, item.match);
                      const Icon = item.icon;
                      const itemLabel = tLiteral(item.label);
                      return (
                        <Link
                          key={`${group.title}-${item.label}`}
                          to={item.href}
                          aria-label={sidebarCollapsed ? itemLabel : undefined}
                          className={`group relative flex items-center rounded-md border-l-2 py-2 text-sm transition-colors ${
                            sidebarCollapsed ? "justify-center px-0" : "px-4"
                          } ${
                            active
                              ? "border-[#fafaf9] bg-[rgba(250,250,249,0.08)] text-[#fafaf9]"
                              : "border-transparent bg-transparent text-[#a8a29e] hover:bg-[rgba(250,250,249,0.04)] hover:text-[#fafaf9]"
                          }`}
                        >
                          {sidebarCollapsed ? (
                            Icon ? (
                              <Icon className="shrink-0" size={18} strokeWidth={1.5} aria-hidden />
                            ) : (
                              <span className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-[#fafaf9]" : "bg-[#57534e]"}`} />
                            )
                          ) : (
                            <span className="flex min-w-0 items-center gap-3">
                              {Icon ? (
                                <Icon className="shrink-0" size={18} strokeWidth={1.5} aria-hidden />
                              ) : (
                                <span className={`h-2 w-2 shrink-0 rounded-full ${active ? "bg-[#fafaf9]" : "bg-[#57534e]"}`} />
                              )}
                              <span className="truncate">{itemLabel}</span>
                            </span>
                          )}
                          {sidebarCollapsed ? (
                            <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-[#3a3633] bg-[#1c1917] px-2.5 py-1.5 text-xs text-[#fafaf9] opacity-0 shadow-[0_8px_18px_rgba(0,0,0,0.28)] transition-opacity group-hover:opacity-100">
                              {itemLabel}
                            </span>
                          ) : null}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </nav>
      </aside>

      <div className="transition-[margin-left] duration-[250ms] ease-in-out" style={{ marginLeft: `${sidebarWidth}px` }}>
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
