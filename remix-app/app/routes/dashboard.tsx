import { useEffect, useState } from "react";
import { Form, Link, redirect } from "react-router";
import type { Route } from "./+types/dashboard";
import { getConnectionString, withPgClient } from "~/lib/pg.server";
import { useI18n } from "~/lib/i18n";
import { canManagePinReset } from "~/lib/role-access.server";
import { sessionTokenCookie } from "~/lib/session-cookie.server";
import { validateSession } from "~/lib/session-validation.server";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const DASHBOARD_I18N: Record<
  "th" | "en" | "lo",
  {
    forgotPasswordHr: string;
    installApp: string;
    logout: string;
  }
> = {
  th: {
    forgotPasswordHr: "ลืมรหัสผ่าน (HR)",
    installApp: "ติดตั้งแอป",
    logout: "ออกจากระบบ",
  },
  en: {
    forgotPasswordHr: "Forgot Password (HR)",
    installApp: "Install App",
    logout: "Logout",
  },
  lo: {
    forgotPasswordHr: "ລືມລະຫັດຜ່ານ (HR)",
    installApp: "ຕິດຕັ້ງແອັບ",
    logout: "ອອກຈາກລະບົບ",
  },
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const { session, error } = await validateSession(request, context);
  if (error || !session) {
    const reason = encodeURIComponent(error || "INVALID_SESSION");
    throw redirect(`/login?auth_error=${reason}`);
  }

  const connectionString = getConnectionString(context);
  let user: { force_pin_change: boolean | null; must_change_password: boolean | null } | null = null;
  let emp: { first_name: string | null; last_name: string | null } | null = null;

  if (connectionString) {
    try {
      [user, emp] = await Promise.all([
        withPgClient(
          connectionString,
          async (client) => {
            const result = await client.query<{
              force_pin_change: boolean | null;
              must_change_password: boolean | null;
            }>(
              `SELECT force_pin_change, must_change_password
               FROM login_users
               WHERE emp_id = $1
               LIMIT 1`,
              [session.emp_id],
            );
            return result.rows[0] || null;
          },
          1,
        ),
        withPgClient(
          connectionString,
          async (client) => {
            const result = await client.query<{ first_name: string | null; last_name: string | null }>(
              `SELECT first_name, last_name
               FROM employees
               WHERE employee_id = $1
               LIMIT 1`,
              [session.emp_id],
            );
            return result.rows[0] || null;
          },
          1,
        ),
      ]);
    } catch (dbError) {
      console.error("dashboard loader DB error:", dbError);
    }
  }

  if (user?.force_pin_change || user?.must_change_password) {
    throw redirect("/change-password");
  }

  return {
    emp_id: session.emp_id,
    role: session.role,
    login_context: session.login_context,
    first_name: emp?.first_name || "",
    last_name: emp?.last_name || "",
    can_reset_password: canManagePinReset(session.role),
  };
}

export async function action() {
  return redirect("/login", {
    headers: {
      // Ensure we don't send `Secure` on plain-http local dev.
      "Set-Cookie": await sessionTokenCookie.serialize("", { maxAge: 0, secure: false }),
    },
  });
}

function ChevronRight({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
      <path d="M9 18l6-6-6-6" />
    </svg>
  );
}

export default function DashboardPage({ loaderData }: Route.ComponentProps) {
  const { lang } = useI18n();
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [ppeAlertOpen, setPpeAlertOpen] = useState(true);
  const T = DASHBOARD_I18N[lang];

  useEffect(() => {
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const onAppInstalled = () => {
      setIsInstalled(true);
      setDeferredInstallPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  async function handleInstallApp() {
    if (!deferredInstallPrompt || installing) return;

    setInstalling(true);
    await deferredInstallPrompt.prompt();
    const result = await deferredInstallPrompt.userChoice;
    if (result.outcome === "accepted") {
      setIsInstalled(true);
    }
    setDeferredInstallPrompt(null);
    setInstalling(false);
  }

  return (
    <div className="px-4 pb-6 pt-5">
      {ppeAlertOpen ? (
        <div className="mb-4 flex items-start gap-2.5 rounded-[14px] border border-[#FDE68A] bg-[#FFFBEB] px-3.5 py-3">
          <span className="mt-0.5 shrink-0 text-[#F59E0B]" aria-hidden>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold text-[#92400E]">แจ้งเตือนความปลอดภัย</p>
            <p className="mt-0.5 text-[11px] leading-snug text-[#B45309]">ตรวจสอบอุปกรณ์ PPE ก่อนลงพื้นที่ภาคสนามวันนี้</p>
          </div>
          <button
            type="button"
            onClick={() => setPpeAlertOpen(false)}
            className="shrink-0 p-0.5 text-[#D97706] transition-opacity hover:opacity-80"
            aria-label="ปิดการแจ้งเตือน"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ) : null}

      <div className="mb-5 grid grid-cols-2 gap-2.5">
        <Link
          to="/scan"
          className="group relative flex flex-col gap-1.5 overflow-hidden rounded-2xl bg-gradient-to-br from-[#7B0020] to-[#E8193A] px-3.5 py-4 shadow-[0_4px_16px_rgba(176,0,48,0.25)] transition active:scale-[0.97] [-webkit-tap-highlight-color:transparent]"
        >
          <span
            className="pointer-events-none absolute -right-5 -top-8 size-[100px] rounded-full bg-white/[0.08]"
            aria-hidden
          />
          <span className="relative flex size-[38px] items-center justify-center rounded-[10px] border border-white/25 bg-white/20">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
              <rect x="7" y="7" width="10" height="10" rx="2" />
            </svg>
          </span>
          <span className="relative text-[13px] font-bold tracking-[-0.2px] text-white">สแกนเข้างาน</span>
          <span className="relative text-[11px] text-white/65">ลงเวลาด้วย GPS</span>
        </Link>
        <div className="relative flex flex-col gap-1.5 overflow-hidden rounded-2xl bg-gradient-to-br from-[#1E40AF] to-[#3B82F6] px-3.5 py-4 shadow-[0_4px_16px_rgba(59,130,246,0.25)] transition active:scale-[0.97] [-webkit-tap-highlight-color:transparent]">
          <span
            className="pointer-events-none absolute -right-5 -top-8 size-[100px] rounded-full bg-white/[0.08]"
            aria-hidden
          />
          <span className="relative flex size-[38px] items-center justify-center rounded-[10px] border border-white/25 bg-white/20">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </span>
          <span className="relative text-[13px] font-bold tracking-[-0.2px] text-white">รายงาน Safety</span>
          <span className="relative text-[11px] text-white/65">รายงานประจำวัน</span>
        </div>
      </div>

      <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.8px] text-[#9898AA]">สรุปเดือนนี้</h2>
      <div className="mb-6 grid grid-cols-2 gap-2.5">
        <div className="relative overflow-hidden rounded-2xl border border-transparent bg-gradient-to-br from-[#B00030] to-[#E8193A] p-4 shadow-sm">
          <div className="mb-2.5 flex size-9 items-center justify-center rounded-[10px] bg-white/18">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </div>
          <p className="text-[22px] font-bold leading-none tracking-[-0.5px] text-white">08:02</p>
          <p className="mt-1 text-[11px] font-medium text-white/65">เข้างานวันนี้</p>
        </div>
        <Link
          to="/scan?tab=history&filter=night"
          className="rounded-2xl border border-[#C7D2FE] bg-[#EEF2FF] p-4 transition active:scale-[0.98] [-webkit-tap-highlight-color:transparent]"
        >
          <div className="mb-2.5 flex size-9 items-center justify-center rounded-[10px] bg-[rgba(99,102,241,0.15)]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4F46E5" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          </div>
          <p className="text-[22px] font-bold leading-none tracking-[-0.5px] text-[#4338CA]">4 วัน</p>
          <p className="mt-1 text-[11px] font-medium text-[#6366F1]">กะกลางคืน/เดือน</p>
        </Link>
        <div className="rounded-2xl border border-black/[0.07] bg-white p-4">
          <div className="mb-2.5 flex size-9 items-center justify-center rounded-[10px] bg-[#FFF0F3]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D0002A" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            </svg>
          </div>
          <p className="text-[22px] font-bold leading-none tracking-[-0.5px] text-[#D0002A]">0</p>
          <p className="mt-1 text-[11px] font-medium text-[#9898AA]">Safety วันนี้</p>
        </div>
        <div className="rounded-2xl border border-black/[0.07] bg-white p-4">
          <div className="mb-2.5 flex size-9 items-center justify-center rounded-[10px] bg-[#FFFBEB]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </div>
          <p className="text-[22px] font-bold leading-none tracking-[-0.5px] text-[#0D0D0D]">2</p>
          <p className="mt-1 text-[11px] font-medium text-[#9898AA]">รายการหักค้าง</p>
        </div>
        <Link
          to="/scan?tab=leave"
          className="rounded-2xl border border-black/[0.07] bg-white p-4 transition active:scale-[0.98] [-webkit-tap-highlight-color:transparent]"
        >
          <div className="mb-2.5 flex size-9 items-center justify-center rounded-[10px] bg-[#F5F3FF]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <path d="M16 2v4M8 2v4M3 10h18" />
              <path d="M8 14h.01M12 14h.01" />
            </svg>
          </div>
          <p className="text-[22px] font-bold leading-none tracking-[-0.5px] text-[#7C3AED]">6 วัน</p>
          <p className="mt-1 text-[11px] font-medium text-[#8B5CF6]">ลาสะสมปีนี้</p>
        </Link>
        <Link
          to="/request"
          className="rounded-2xl border border-black/[0.07] bg-white p-4 transition active:scale-[0.98] [-webkit-tap-highlight-color:transparent]"
        >
          <div className="mb-2.5 flex size-9 items-center justify-center rounded-[10px] bg-[#EDFBF4]">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00B96B" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
          </div>
          <p className="text-[22px] font-bold leading-none tracking-[-0.5px] text-[#0D0D0D]">2</p>
          <p className="mt-1 text-[11px] font-medium text-[#9898AA]">คำขอรออนุมัติ</p>
        </Link>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-bold uppercase tracking-[0.8px] text-[#9898AA]">ข่าวสารและประกาศ</h2>
        <span className="text-[11px] font-semibold tracking-normal text-[#D0002A]">ดูทั้งหมด →</span>
      </div>
      <div className="mb-6 flex flex-col gap-2">
        <div className="cursor-pointer rounded-[14px] border border-[#C4B5FD] bg-[#FAFAFF] px-3.5 py-3 transition active:scale-[0.99] [-webkit-tap-highlight-color:transparent]">
          <span className="mb-1.5 inline-block rounded-full bg-[#EDE9FE] px-2 py-0.5 text-[10px] font-bold tracking-[0.2px] text-[#6D28D9]">นโยบาย</span>
          <p className="text-[13px] font-semibold leading-snug text-[#0D0D0D]">อัปเดตนโยบายความปลอดภัยในพื้นที่เหมือง Q2/2569</p>
          <p className="mt-1 text-[11px] text-[#9898AA]">HR · 20 มี.ค. 2569</p>
        </div>
        <div className="cursor-pointer rounded-[14px] border border-black/[0.07] bg-white px-3.5 py-3 transition active:scale-[0.99] [-webkit-tap-highlight-color:transparent]">
          <span className="mb-1.5 inline-block rounded-full bg-[#EDFBF4] px-2 py-0.5 text-[10px] font-bold tracking-[0.2px] text-[#065F46]">ข่าวสาร</span>
          <p className="text-[13px] font-semibold leading-snug text-[#0D0D0D]">ผลการดำเนินงานเหมืองทองไตรมาส 1 บรรลุเป้าหมาย 103%</p>
          <p className="mt-1 text-[11px] text-[#9898AA]">ฝ่ายผลิต · 18 มี.ค. 2569</p>
        </div>
        <div className="cursor-pointer rounded-[14px] border border-[#FCA5A5] bg-[#FFF8F8] px-3.5 py-3 transition active:scale-[0.99] [-webkit-tap-highlight-color:transparent]">
          <span className="mb-1.5 inline-block rounded-full bg-[#FEE2E2] px-2 py-0.5 text-[10px] font-bold tracking-[0.2px] text-[#991B1B]">ใบเตือน</span>
          <p className="text-[13px] font-semibold leading-snug text-[#0D0D0D]">แจ้งเตือน: พื้นที่เหมืองถ่านหินโซน C ปิดชั่วคราวเพื่อตรวจสอบ</p>
          <p className="mt-1 text-[11px] text-[#9898AA]">ความปลอดภัย · 21 มี.ค. 2569</p>
        </div>
      </div>

      <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.8px] text-[#9898AA]">บริการ</h2>
      <div className="mb-6 grid grid-cols-2 gap-2.5">
        <Link
          to="/slip"
          className="flex flex-col gap-2.5 rounded-2xl border border-black/[0.07] bg-white p-4 transition active:scale-[0.96] [-webkit-tap-highlight-color:transparent]"
        >
          <span className="flex size-11 items-center justify-center rounded-[13px] bg-[#FFF8E1]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
          </span>
          <div>
            <p className="text-[13px] font-bold leading-snug text-[#0D0D0D]">สลิปเงินเดือน</p>
            <p className="mt-0.5 text-[11px] leading-snug text-[#9898AA]">เงินเดือนและโอที</p>
          </div>
          <span className="mt-auto flex justify-end text-[#9898AA]">
            <ChevronRight />
          </span>
        </Link>
        {[
          {
            title: "รายการหักค้าง",
            sub: "ค่าใช้จ่ายที่รับผิดชอบ",
            iconBg: "bg-[#FFF0F3]",
            stroke: "#D0002A",
            icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            ),
          },
          {
            title: "รายงานการผลิต",
            sub: "ทอง / ถ่านหิน รายวัน",
            iconBg: "bg-[#F0FDF4]",
            stroke: "#16A34A",
            icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
              </svg>
            ),
          },
          {
            title: "ใบแจ้งซ่อม",
            sub: "เครื่องจักร / อุปกรณ์",
            iconBg: "bg-[#FFF0F3]",
            stroke: "#D0002A",
            icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
            ),
          },
          {
            title: "รายงาน Safety",
            sub: "รายงานเหตุการณ์",
            iconBg: "bg-[#EFF6FF]",
            stroke: "#3B82F6",
            icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            ),
          },
          {
            title: "ใบเตือน / แจ้งโทษ",
            sub: "ประวัติการแจ้งเตือน",
            iconBg: "bg-[#F5F3FF]",
            stroke: "#8B5CF6",
            icon: (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <rect x="3" y="3" width="7" height="7" />
                <rect x="14" y="3" width="7" height="7" />
                <rect x="3" y="14" width="7" height="7" />
                <path d="M14 14h3v3M17 20h3M20 17v3" />
              </svg>
            ),
          },
        ].map((item) => (
          <div
            key={item.title}
            className="flex cursor-default flex-col gap-2.5 rounded-2xl border border-black/[0.07] bg-white p-4 [-webkit-tap-highlight-color:transparent]"
          >
            <span className={`flex size-11 items-center justify-center rounded-[13px] ${item.iconBg}`} style={{ color: item.stroke }}>
              {item.icon}
            </span>
            <div>
              <p className="text-[13px] font-bold leading-snug text-[#0D0D0D]">{item.title}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-[#9898AA]">{item.sub}</p>
            </div>
            <span className="mt-auto flex justify-end text-[#9898AA]">
              <ChevronRight />
            </span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-3 border-t border-black/[0.06] pt-5">
        {loaderData.can_reset_password && (
          <Link
            to="/forgot-password"
            className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-2 text-sm font-medium text-[#991B1B] hover:bg-[#FEE2E2]"
          >
            {T.forgotPasswordHr}
          </Link>
        )}
        {!isInstalled && deferredInstallPrompt && (
          <button
            type="button"
            onClick={() => void handleInstallApp()}
            disabled={installing}
            className="rounded-lg border border-[#FECACA] bg-[#FEF2F2] px-4 py-2 text-sm font-semibold text-[#991B1B] hover:bg-[#FEE2E2] disabled:opacity-60"
          >
            {installing ? `${T.installApp}...` : T.installApp}
          </button>
        )}
        <Form method="post">
          <button type="submit" className="rounded-lg bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white hover:bg-[#991B1B]">
            {T.logout}
          </button>
        </Form>
      </div>
    </div>
  );
}
