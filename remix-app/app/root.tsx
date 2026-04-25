import {
  isRouteErrorResponse,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
  useLocation,
} from "react-router";

import type { Route } from "./+types/root";
import { LanguageSwitcher } from "./components/language-switcher";
import { PwaInstallPrompt } from "./components/pwa-install-prompt";
import { PwaRegister } from "./components/pwa-register";
import { loadEmployeeDashboardSnapshot } from "./lib/employee-dashboard.server";
import { getConnectionString } from "./lib/pg.server";
import { I18nProvider, useI18n } from "./lib/i18n";
import { getLangFromRequest } from "./lib/i18n.server";
import type { LangCode } from "./lib/i18n.shared";
import { validateSession } from "./lib/session-validation.server";
import "./app.css";

export async function loader({ request, context }: Route.LoaderArgs) {
  const lang = await getLangFromRequest(request);
  const pathname = new URL(request.url).pathname;
  let shellData = null;

  if (showEmployeeShell(pathname)) {
    const { session, error } = await validateSession(request, context);
    if (!error && session) {
      shellData = await loadEmployeeDashboardSnapshot(getConnectionString(context), session.emp_id);
    }
  }

  return { lang, shellData };
}

export const links: Route.LinksFunction = () => [
  { rel: "manifest", href: "/manifest.json" },
  { rel: "apple-touch-icon", href: "/icons/icon-192.svg" },
  { rel: "preconnect", href: "https://fonts.googleapis.com" },
  {
    rel: "preconnect",
    href: "https://fonts.gstatic.com",
    crossOrigin: "anonymous",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=Noto+Sans:wght@400;500;600;700&family=Noto+Sans+Thai:wght@400;500;600;700&family=Noto+Sans+Lao:wght@400;500;600;700&display=swap",
  },
  {
    rel: "stylesheet",
    href: "https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap",
  },
];

const EMPLOYEE_SHELL_COPY: Record<
  LangCode,
  {
    avatar: string;
    title: string;
    subtitle: string;
    stats: Array<{ value: string; label: string; tone?: "default" | "accent" }>;
    navLabel: string;
    nav: Array<{ key: "home" | "scan" | "request" | "profile"; label: string; to: string; end?: boolean }>;
  }
> = {
  th: {
    avatar: "TDLao",
    title: "พนักงาน",
    subtitle: "employee_portal",
    stats: [
      { value: "08:02", label: "เข้างาน" },
      { value: "21 วัน", label: "ทำงาน/เดือน" },
      { value: "4 วัน", label: "กะกลางคืน", tone: "accent" },
      { value: "2.5 ชม.", label: "OT สะสม" },
    ],
    navLabel: "เมนูหลัก",
    nav: [
      { key: "home", label: "หน้าหลัก", to: "/dashboard", end: true },
      { key: "scan", label: "สแกน", to: "/scan" },
      { key: "request", label: "คำขอ", to: "/request" },
      { key: "profile", label: "โปรไฟล์", to: "/change-pin", end: true },
    ],
  },
  en: {
    avatar: "E",
    title: "Employee",
    subtitle: "employee_portal",
    stats: [
      { value: "08:02", label: "Check in" },
      { value: "21 days", label: "Work days / month" },
      { value: "4 days", label: "Night shift", tone: "accent" },
      { value: "2.5 hrs", label: "Accumulated OT" },
    ],
    navLabel: "Main navigation",
    nav: [
      { key: "home", label: "Home", to: "/dashboard", end: true },
      { key: "scan", label: "Scan", to: "/scan" },
      { key: "request", label: "Requests", to: "/request" },
      { key: "profile", label: "Profile", to: "/change-pin", end: true },
    ],
  },
  lo: {
    avatar: "ພ",
    title: "ພະນັກງານ",
    subtitle: "employee_portal",
    stats: [
      { value: "08:02", label: "ເຂົ້າວຽກ" },
      { value: "21 ມື້", label: "ມື້ເຮັດວຽກ / ເດືອນ" },
      { value: "4 ມື້", label: "ກະກາງຄືນ", tone: "accent" },
      { value: "2.5 ຊມ.", label: "OT ສະສົມ" },
    ],
    navLabel: "ເມນູຫຼັກ",
    nav: [
      { key: "home", label: "ໜ້າຫຼັກ", to: "/dashboard", end: true },
      { key: "scan", label: "ສະແກນ", to: "/scan" },
      { key: "request", label: "ຄຳຂໍ", to: "/request" },
      { key: "profile", label: "ໂປຣໄຟລ໌", to: "/change-pin", end: true },
    ],
  },
};

function showEmployeeShell(pathname: string) {
  if (pathname.startsWith("/admin")) return false;
  if (pathname === "/") return false;
  const authPaths = new Set([
    "/login",
    "/activate",
    "/set-pin",
    "/set-password",
    "/forgot-pin",
    "/forgot-password",
    "/reset-pin",
    "/reset-password",
  ]);
  if (authPaths.has(pathname)) return false;
  return true;
}

function IconHome({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function IconScan({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </svg>
  );
}

function IconRequest({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" y1="13" x2="8" y2="13" />
      <line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  );
}

function IconProfile({ className }: { className?: string }) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  );
}

function AppHeader() {
  const { lang } = useI18n();
  const copy = EMPLOYEE_SHELL_COPY[lang];
  const loaderData = useLoaderData<typeof loader>();
  const shellData = loaderData.shellData;

  const daysUnit = lang === "en" ? "days" : lang === "lo" ? "ມື້" : "วัน";
  const hoursUnit = lang === "en" ? "hrs" : lang === "lo" ? "ຊມ." : "ชม.";
  const formatMetricValue = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));
  const stats = [
    {
      ...copy.stats[0],
      value: shellData?.todayCheckInTime || "--:--",
    },
    {
      ...copy.stats[1],
      value: `${formatMetricValue(shellData?.workedDaysThisMonth ?? 0)} ${daysUnit}`,
    },
    {
      ...copy.stats[2],
      value: `${formatMetricValue(shellData?.nightShiftDaysThisMonth ?? 0)} ${daysUnit}`,
    },
    {
      ...copy.stats[3],
      value: `${formatMetricValue(shellData?.otHoursTotal ?? 0)} ${hoursUnit}`,
    },
  ];

  return (
    <header className="relative shrink-0 overflow-hidden bg-[linear-gradient(160deg,#4A0010_0%,#B00030_55%,#E8193A_100%)] px-5 pb-[18px] pt-[calc(14px+env(safe-area-inset-top,0px))]">
      <div
        className="pointer-events-none absolute -right-10 -top-[60px] size-[200px] rounded-full opacity-100"
        style={{
          background: "radial-gradient(circle, rgba(255,255,255,0.12) 0%, transparent 70%)",
        }}
        aria-hidden
      />
      <div className="relative flex items-center gap-3">
        <div className="relative shrink-0">
          <div
            className="flex size-[42px] items-center justify-center rounded-[14px] border-[1.5px] border-white/35 bg-white/20 text-[15px] font-bold text-white backdrop-blur-[8px]"
            aria-hidden
          >
            {copy.avatar}
          </div>
          <span
            className="absolute -bottom-px -right-px size-[11px] rounded-full border-2 border-[#B00030] bg-[#00E676]"
            title="online"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold tracking-[-0.2px] text-white">{copy.title}</p>
          <p className="mt-0.5 text-[11px] tracking-[0.3px] text-white/55">- {copy.subtitle}</p>
        </div>
        <LanguageSwitcher />
      </div>
      <div className="relative mt-3.5 flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {stats.map((item) => (
          <div
            key={item.label}
            className={`flex min-w-[80px] shrink-0 flex-col rounded-xl px-3 py-2 backdrop-blur-[8px] ${
              item.tone === "accent"
                ? "border border-[rgba(165,180,252,0.35)] bg-[rgba(99,102,241,0.25)]"
                : "border border-white/15 bg-white/12"
            }`}
          >
            <span className="text-[17px] font-bold leading-none text-white">{item.value}</span>
            <span className="mt-0.5 text-[10px] tracking-[0.2px] text-white/55">{item.label}</span>
          </div>
        ))}
      </div>
    </header>
  );
}

function BottomNav() {
  const { lang } = useI18n();
  const copy = EMPLOYEE_SHELL_COPY[lang];
  const linkClass =
    "relative flex min-h-[60px] flex-col items-center justify-center gap-1 px-1 pb-2 pt-2.5 transition-transform active:scale-[0.92] [-webkit-tap-highlight-color:transparent] before:left-0 before:right-0";

  const icons = {
    home: IconHome,
    scan: IconScan,
    request: IconRequest,
    profile: IconProfile,
  };

  return (
    <nav
      className="fixed bottom-0 left-1/2 z-[200] grid w-full max-w-[430px] -translate-x-1/2 grid-cols-4 border-t border-black/[0.06] bg-white/[0.92] backdrop-blur-[20px] backdrop-saturate-[180%] [-webkit-backdrop-filter:blur(20px)_saturate(180%)] pb-[env(safe-area-inset-bottom,0px)]"
      aria-label={copy.navLabel}
    >
      {copy.nav.map((item) => {
        const Icon = icons[item.key];
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) => `${linkClass} ${isActive ? "before:absolute before:top-0 before:h-[2.5px] before:bg-[#D0002A]" : ""}`}
          >
            {({ isActive }) => (
              <>
                <span className={`flex h-7 w-11 items-center justify-center rounded-full transition-colors ${isActive ? "bg-[#FFF0F3]" : ""}`}>
                  <Icon className={isActive ? "stroke-[#D0002A]" : "stroke-[#9898AA]"} />
                </span>
                <span className={`text-[10px] ${isActive ? "font-bold text-[#D0002A]" : "font-medium text-[#9898AA]"}`}>{item.label}</span>
              </>
            )}
          </NavLink>
        );
      })}
    </nav>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const loaderData = useLoaderData<typeof loader>() as { lang?: LangCode } | undefined;
  const lang = loaderData?.lang ?? "th";

  return (
    <html lang={lang}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#B00030" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="TD One" />
        <Meta />
        <Links />
      </head>
      <body className="bg-white text-[#111111] antialiased">
        {children}
        <PwaInstallPrompt />
        <PwaRegister />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

function AppFrame() {
  const { pathname } = useLocation();
  const shell = showEmployeeShell(pathname);

  if (!shell) {
    const showFloatingLanguageSwitcher = !pathname.startsWith("/admin/");

    return (
      <>
        {showFloatingLanguageSwitcher ? (
          <div className="fixed right-4 top-4 z-[250]">
            <LanguageSwitcher
              className="flex gap-[3px] rounded-xl border border-black/[0.08] bg-white/90 p-1 shadow-sm backdrop-blur"
              activeClassName="border-transparent bg-[#B00030] text-white"
              idleClassName="border-transparent bg-transparent text-[#555555]"
            />
          </div>
        ) : null}
        <Outlet />
      </>
    );
  }

  return (
    <div className="mx-auto flex h-dvh max-w-[430px] flex-col overflow-hidden bg-[#F4F4F6] font-sans">
      <AppHeader />
      <main className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(72px+env(safe-area-inset-bottom,0px))] [-webkit-overflow-scrolling:touch]">
        <Outlet />
      </main>
      <BottomNav />
    </div>
  );
}

export default function App({ loaderData }: Route.ComponentProps) {
  const lang = loaderData?.lang ?? "th";

  return (
    <I18nProvider initialLang={lang}>
      <AppFrame />
    </I18nProvider>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404
        ? "The requested page could not be found."
        : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="container mx-auto p-4 pt-16">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full overflow-x-auto p-4">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
