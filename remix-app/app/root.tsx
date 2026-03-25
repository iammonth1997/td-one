import {
  isRouteErrorResponse,
  Links,
  Meta,
  NavLink,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLocation,
} from "react-router";
import { useState } from "react";

import type { Route } from "./+types/root";
import { PwaInstallPrompt } from "./components/pwa-install-prompt";
import { PwaRegister } from "./components/pwa-register";
import "./app.css";

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

type LangCode = "th" | "en" | "lo";

function AppHeader({ lang, onLangChange }: { lang: LangCode; onLangChange: (code: LangCode) => void }) {
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
            ผ
          </div>
          <span
            className="absolute -bottom-px -right-px size-[11px] rounded-full border-2 border-[#B00030] bg-[#00E676]"
            title="online"
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-bold tracking-[-0.2px] text-white">พนักงาน</p>
          <p className="mt-0.5 text-[11px] tracking-[0.3px] text-white/55">— · employee_portal</p>
        </div>
        <div className="flex shrink-0 gap-[3px]" role="group" aria-label="Language">
          {(
            [
              { code: "th" as const, label: "TH" },
              { code: "en" as const, label: "EN" },
              { code: "lo" as const, label: "LO" },
            ] as const
          ).map(({ code, label }) => (
            <button
              key={code}
              type="button"
              onClick={() => onLangChange(code)}
              className={`rounded-lg border px-2 py-1 text-[10px] font-semibold tracking-[0.3px] transition-all active:scale-[0.91] ${
                lang === code
                  ? "border-transparent bg-white/95 text-[#B00030]"
                  : "border-white/18 bg-white/10 text-white/65"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative mt-3.5 flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex min-w-[80px] shrink-0 flex-col rounded-xl border border-white/15 bg-white/12 px-3 py-2 backdrop-blur-[8px]">
          <span className="text-[17px] font-bold leading-none text-white">08:02</span>
          <span className="mt-0.5 text-[10px] tracking-[0.2px] text-white/55">เข้างาน</span>
        </div>
        <div className="flex min-w-[80px] shrink-0 flex-col rounded-xl border border-white/15 bg-white/12 px-3 py-2 backdrop-blur-[8px]">
          <span className="text-[17px] font-bold leading-none text-white">21 วัน</span>
          <span className="mt-0.5 text-[10px] tracking-[0.2px] text-white/55">ทำงาน/เดือน</span>
        </div>
        <div className="flex min-w-[80px] shrink-0 flex-col rounded-xl border border-[rgba(165,180,252,0.35)] bg-[rgba(99,102,241,0.25)] px-3 py-2 backdrop-blur-[8px]">
          <span className="text-[17px] font-bold leading-none text-white">4 วัน</span>
          <span className="mt-0.5 text-[10px] tracking-[0.2px] text-white/55">กะกลางคืน</span>
        </div>
        <div className="flex min-w-[80px] shrink-0 flex-col rounded-xl border border-white/15 bg-white/12 px-3 py-2 backdrop-blur-[8px]">
          <span className="text-[17px] font-bold leading-none text-white">2.5 ชม.</span>
          <span className="mt-0.5 text-[10px] tracking-[0.2px] text-white/55">OT สะสม</span>
        </div>
      </div>
    </header>
  );
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

function BottomNav() {
  const linkClass =
    "relative flex min-h-[60px] flex-col items-center justify-center gap-1 px-1 pb-2 pt-2.5 transition-transform active:scale-[0.92] [-webkit-tap-highlight-color:transparent] before:left-0 before:right-0";

  return (
    <nav
      className="fixed bottom-0 left-1/2 z-[200] grid w-full max-w-[430px] -translate-x-1/2 grid-cols-4 border-t border-black/[0.06] bg-white/[0.92] backdrop-blur-[20px] backdrop-saturate-[180%] [-webkit-backdrop-filter:blur(20px)_saturate(180%)] pb-[env(safe-area-inset-bottom,0px)]"
      aria-label="หลัก"
    >
      <NavLink
        to="/dashboard"
        end
        className={({ isActive }) => `${linkClass} ${isActive ? "before:absolute before:top-0 before:h-[2.5px] before:bg-[#D0002A]" : ""}`}
      >
        {({ isActive }) => (
          <>
            <span
              className={`flex h-7 w-11 items-center justify-center rounded-full transition-colors ${isActive ? "bg-[#FFF0F3]" : ""}`}
            >
              <IconHome className={isActive ? "stroke-[#D0002A]" : "stroke-[#9898AA]"} />
            </span>
            <span className={`text-[10px] ${isActive ? "font-bold text-[#D0002A]" : "font-medium text-[#9898AA]"}`}>หน้าหลัก</span>
          </>
        )}
      </NavLink>
      <NavLink
        to="/scan"
        className={({ isActive }) => `${linkClass} ${isActive ? "before:absolute before:top-0 before:h-[2.5px] before:bg-[#D0002A]" : ""}`}
      >
        {({ isActive }) => (
          <>
            <span className={`flex h-7 w-11 items-center justify-center rounded-full transition-colors ${isActive ? "bg-[#FFF0F3]" : ""}`}>
              <IconScan className={isActive ? "stroke-[#D0002A]" : "stroke-[#9898AA]"} />
            </span>
            <span className={`text-[10px] ${isActive ? "font-bold text-[#D0002A]" : "font-medium text-[#9898AA]"}`}>สแกน</span>
          </>
        )}
      </NavLink>
      <NavLink
        to="/request"
        className={({ isActive }) => `${linkClass} ${isActive ? "before:absolute before:top-0 before:h-[2.5px] before:bg-[#D0002A]" : ""}`}
      >
        {({ isActive }) => (
          <>
            <span className={`relative flex h-7 w-11 items-center justify-center rounded-full transition-colors ${isActive ? "bg-[#FFF0F3]" : ""}`}>
              <IconRequest className={isActive ? "stroke-[#D0002A]" : "stroke-[#9898AA]"} />
            </span>
            <span className={`text-[10px] ${isActive ? "font-bold text-[#D0002A]" : "font-medium text-[#9898AA]"}`}>คำขอ</span>
          </>
        )}
      </NavLink>
      <NavLink
        to="/change-pin"
        end
        className={({ isActive }) => `${linkClass} ${isActive ? "before:absolute before:top-0 before:h-[2.5px] before:bg-[#D0002A]" : ""}`}
      >
        {({ isActive }) => (
          <>
            <span className={`flex h-7 w-11 items-center justify-center rounded-full transition-colors ${isActive ? "bg-[#FFF0F3]" : ""}`}>
              <IconProfile className={isActive ? "stroke-[#D0002A]" : "stroke-[#9898AA]"} />
            </span>
            <span className={`text-[10px] ${isActive ? "font-bold text-[#D0002A]" : "font-medium text-[#9898AA]"}`}>โปรไฟล์</span>
          </>
        )}
      </NavLink>
    </nav>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th">
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

export default function App() {
  const { pathname } = useLocation();
  const [lang, setLang] = useState<LangCode>("th");
  const shell = showEmployeeShell(pathname);

  if (!shell) {
    return <Outlet />;
  }

  return (
    <div className="mx-auto flex h-dvh max-w-[430px] flex-col overflow-hidden bg-[#F4F4F6] font-sans">
      <AppHeader lang={lang} onLangChange={setLang} />
      <main className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[calc(72px+env(safe-area-inset-bottom,0px))] [-webkit-overflow-scrolling:touch]">
        <Outlet />
      </main>
      <BottomNav />
    </div>
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
    <main className="pt-16 p-4 container mx-auto">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full p-4 overflow-x-auto">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
