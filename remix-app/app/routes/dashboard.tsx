import type { ReactNode } from "react";
import { Link, redirect } from "react-router";

import type { Route } from "./+types/dashboard";
import { loadEmployeeDashboardSnapshot } from "~/lib/employee-dashboard.server";
import { getConnectionString, withPgClient } from "~/lib/pg.server";
import { useI18n } from "~/lib/i18n";
import { canManagePinReset } from "~/lib/role-access.server";
import { validateSession } from "~/lib/session-validation.server";

type DashboardCardStyle = {
  accentClassName: string;
  iconBgClassName: string;
  iconStroke: string;
  icon: ReactNode;
};

type DashboardCardCopy = {
  title: string;
  description: string;
  value: string;
  detail: string;
};

type DashboardCopy = {
  cards: {
    workdays: DashboardCardCopy;
    leave: DashboardCardCopy;
    ot: DashboardCardCopy;
    slip: DashboardCardCopy;
  };
  labels: {
    days: string;
    hours: string;
    noData: string;
    workDayDetail: string;
    leaveUsedDetail: string;
    otDetail: string;
    slipDetail: string;
  };
  monthFormatterLocale: string;
};

const CARD_STYLES: Record<"workdays" | "leave" | "ot" | "slip", DashboardCardStyle> = {
  workdays: {
    accentClassName: "shadow-[0_6px_20px_rgba(176,0,48,0.08)]",
    iconBgClassName: "bg-[#FFF0F3]",
    iconStroke: "#D0002A",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
  },
  leave: {
    accentClassName: "shadow-[0_6px_20px_rgba(124,58,237,0.08)]",
    iconBgClassName: "bg-[#F5F3FF]",
    iconStroke: "#7C3AED",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="4" width="18" height="18" rx="2" />
        <path d="M16 2v4M8 2v4M3 10h18" />
        <path d="M8 14h.01M12 14h.01" />
      </svg>
    ),
  },
  ot: {
    accentClassName: "shadow-[0_6px_20px_rgba(59,130,246,0.08)]",
    iconBgClassName: "bg-[#EFF6FF]",
    iconStroke: "#2563EB",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M13 2L3 14h7l-1 8 10-12h-7z" />
      </svg>
    ),
  },
  slip: {
    accentClassName: "shadow-[0_6px_20px_rgba(245,158,11,0.08)]",
    iconBgClassName: "bg-[#FFF8E1]",
    iconStroke: "#D97706",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <line x1="2" y1="10" x2="22" y2="10" />
      </svg>
    ),
  },
};

const DASHBOARD_I18N: Record<"th" | "en" | "lo", DashboardCopy> = {
  th: {
    cards: {
      workdays: {
        title: "ข้อมูลวันงาน",
        description: "วันทำงานและสถิติการเข้างานเดือนนี้",
        value: "",
        detail: "",
      },
      leave: {
        title: "ข้อมูลวันลา",
        description: "วันลาคงเหลือ ใช้ไป และยอดสะสม",
        value: "",
        detail: "",
      },
      ot: {
        title: "ข้อมูล OT",
        description: "ชั่วโมง OT เดือนนี้และ OT สะสม",
        value: "",
        detail: "",
      },
      slip: {
        title: "ข้อมูลสลิปเงินเดือน",
        description: "เปิดดูสลิปล่าสุดและสรุปรายการจ่าย",
        value: "",
        detail: "",
      },
    },
    labels: {
      days: "วัน",
      hours: "ชม.",
      noData: "ยังไม่มีข้อมูล",
      workDayDetail: "เข้างานเดือนนี้",
      leaveUsedDetail: "ใช้ไป {value} วัน",
      otDetail: "OT อนุมัติเดือนนี้",
      slipDetail: "เงินเดือนล่าสุด",
    },
    monthFormatterLocale: "th-TH",
  },
  en: {
    cards: {
      workdays: {
        title: "Work Days",
        description: "Days worked and attendance stats this month",
        value: "",
        detail: "",
      },
      leave: {
        title: "Leave Summary",
        description: "Leave balance, used leave, and remaining days",
        value: "",
        detail: "",
      },
      ot: {
        title: "OT Summary",
        description: "OT hours this month and accumulated OT",
        value: "",
        detail: "",
      },
      slip: {
        title: "Salary Slip",
        description: "Open the latest slip and payment summary",
        value: "",
        detail: "",
      },
    },
    labels: {
      days: "days",
      hours: "hrs",
      noData: "No data yet",
      workDayDetail: "Worked this month",
      leaveUsedDetail: "{value} days used",
      otDetail: "Approved OT this month",
      slipDetail: "Latest salary slip",
    },
    monthFormatterLocale: "en-US",
  },
  lo: {
    cards: {
      workdays: {
        title: "ຂໍ້ມູນວັນເຮັດວຽກ",
        description: "ສະຫຼຸບມື້ເຮັດວຽກ ແລະ ການເຂົ້າວຽກເດືອນນີ້",
        value: "",
        detail: "",
      },
      leave: {
        title: "ຂໍ້ມູນວັນລາ",
        description: "ຍອດລາຄົງເຫຼືອ ວັນລາທີ່ໃຊ້ ແລະ ວັນທີ່ເຫຼືອ",
        value: "",
        detail: "",
      },
      ot: {
        title: "ຂໍ້ມູນ OT",
        description: "ຊົ່ວໂມງ OT ເດືອນນີ້ ແລະ OT ສະສົມ",
        value: "",
        detail: "",
      },
      slip: {
        title: "ຂໍ້ມູນສະລິບເງິນເດືອນ",
        description: "ເປີດເບິ່ງສະລິບຫຼ້າສຸດ ແລະ ລາຍການຈ່າຍ",
        value: "",
        detail: "",
      },
    },
    labels: {
      days: "ມື້",
      hours: "ຊມ.",
      noData: "ຍັງບໍ່ມີຂໍ້ມູນ",
      workDayDetail: "ເຮັດວຽກເດືອນນີ້",
      leaveUsedDetail: "ໃຊ້ໄປ {value} ມື້",
      otDetail: "OT ອະນຸມັດເດືອນນີ້",
      slipDetail: "ສະລິບເງິນເດືອນຫຼ້າສຸດ",
    },
    monthFormatterLocale: "lo-LA",
  },
};

function formatMonthYear(year: number, month: number, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    month: "short",
    year: "numeric",
  }).format(new Date(year, month - 1, 1));
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

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

  const dashboardSnapshot = await loadEmployeeDashboardSnapshot(connectionString, session.emp_id);

  return {
    emp_id: session.emp_id,
    role: session.role,
    login_context: session.login_context,
    first_name: dashboardSnapshot.firstName || emp?.first_name || "",
    last_name: dashboardSnapshot.lastName || emp?.last_name || "",
    can_reset_password: canManagePinReset(session.role),
    workedDays: dashboardSnapshot.workedDaysThisMonth,
    leaveUsed: dashboardSnapshot.leaveUsedThisMonth,
    leaveRemaining: dashboardSnapshot.leaveRemaining,
    otHoursThisMonth: dashboardSnapshot.otHoursThisMonth,
    latestSlip: dashboardSnapshot.latestSlip,
  };
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
  const T = DASHBOARD_I18N[lang];

  const cards = [
    {
      key: "workdays" as const,
      to: "/day-work/view",
      value: `${formatNumber(loaderData.workedDays)} ${T.labels.days}`,
      detail: T.labels.workDayDetail,
    },
    {
      key: "leave" as const,
      to: "/request/leave",
      value: `${lang === "en" ? `${formatNumber(loaderData.leaveRemaining)} ${T.labels.days} left` : `คงเหลือ ${formatNumber(loaderData.leaveRemaining)} ${T.labels.days}`}`,
      detail:
        lang === "th"
          ? `ใช้ไป ${formatNumber(loaderData.leaveUsed)} วัน`
          : lang === "en"
            ? `${formatNumber(loaderData.leaveUsed)} days used`
            : `ໃຊ້ໄປ ${formatNumber(loaderData.leaveUsed)} ມື້`,
    },
    {
      key: "ot" as const,
      to: "/request/ot",
      value: `${formatNumber(loaderData.otHoursThisMonth)} ${T.labels.hours}`,
      detail: T.labels.otDetail,
    },
    {
      key: "slip" as const,
      to: "/slip",
      value: loaderData.latestSlip
        ? formatMonthYear(loaderData.latestSlip.year, loaderData.latestSlip.month, T.monthFormatterLocale)
        : T.labels.noData,
      detail: T.labels.slipDetail,
    },
  ];

  return (
    <div className="px-4 pb-6 pt-5">
      <div className="grid grid-cols-2 gap-2.5">
        {cards.map((card) => {
          const copy = T.cards[card.key];
          const style = CARD_STYLES[card.key];

          return (
            <Link
              key={card.key}
              to={card.to}
              className={`flex min-h-[176px] flex-col gap-2.5 rounded-2xl border border-black/[0.07] bg-white p-4 transition active:scale-[0.96] [-webkit-tap-highlight-color:transparent] ${style.accentClassName}`}
            >
              <span
                className={`flex size-11 items-center justify-center rounded-[13px] ${style.iconBgClassName}`}
                style={{ color: style.iconStroke }}
              >
                {style.icon}
              </span>
              <div className="space-y-1">
                <p className="text-[13px] font-bold leading-snug text-[#0D0D0D]">{copy.title}</p>
                <p className="text-[11px] leading-snug text-[#9898AA]">{copy.description}</p>
              </div>
              <div className="mt-auto space-y-0.5">
                <p className="text-[20px] font-bold leading-none tracking-[-0.4px] text-[#0D0D0D]">{card.value}</p>
                <p className="text-[11px] font-medium text-[#B00030]">{card.detail}</p>
              </div>
              <span className="flex justify-end text-[#9898AA]">
                <ChevronRight />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
