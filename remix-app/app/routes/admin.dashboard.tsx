import { Link } from "react-router";

import type { Route } from "./+types/admin.dashboard";
import LeaveCalendar from "~/components/LeaveCalendar";
import AdminShell from "~/components/admin-shell";
import { useDashboardTranslation } from "~/lib/dashboard-translations";
import { loadDashboardMessages } from "~/lib/dashboard-translations.server";
import {
  loadCalendarWindow,
  loadDashboardPageData,
  parseRequestedCalendarRange,
  resolveDashboardScope,
  type DashboardRecentRequest,
} from "~/lib/dashboard.server";
import { useI18n } from "~/lib/i18n";
import { requireRequestAdminSession } from "~/lib/request-admin-session.server";
import { REQUEST_STATUS_CLASSNAMES } from "~/lib/request-types";
import { useRequestTranslation } from "~/lib/request-translations";
import { loadRequestMessages } from "~/lib/request-translations.server";

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12);
}

function formatIsoDateLabel(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(parseIsoDate(value));
}

function formatRelativeTime(value: string, t: (key: string, values?: Record<string, string | number>) => string) {
  const diffMs = Date.now() - new Date(value).getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60_000));

  if (diffMinutes < 1) {
    return t("ago_just_now");
  }

  if (diffMinutes < 60) {
    return t("ago_minutes", { count: diffMinutes });
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return t("ago_hours", { count: diffHours });
  }

  const diffDays = Math.round(diffHours / 24);
  return t("ago_days", { count: diffDays });
}

function formatRequestDateRange(row: DashboardRecentRequest, locale: string) {
  if (row.requestType === "RESIGNATION") {
    return row.lastWorkingDay ? formatIsoDateLabel(row.lastWorkingDay, locale) : "-";
  }

  if (row.requestType === "PIECE_WORK") {
    if (row.workDates.length === 0) {
      return "-";
    }

    const sortedDates = [...row.workDates].sort();
    if (sortedDates.length === 1) {
      return formatIsoDateLabel(sortedDates[0], locale);
    }

    return `${formatIsoDateLabel(sortedDates[0], locale)} - ${formatIsoDateLabel(sortedDates[sortedDates.length - 1], locale)}`;
  }

  const startDate = row.startDate ?? row.endDate;
  const endDate = row.endDate ?? row.startDate;

  if (!startDate && !endDate) {
    return "-";
  }

  if (!startDate || !endDate || startDate === endDate) {
    return formatIsoDateLabel(startDate || endDate || "", locale);
  }

  return `${formatIsoDateLabel(startDate, locale)} - ${formatIsoDateLabel(endDate, locale)}`;
}

function formatEmployeeCodeLabel(row: DashboardRecentRequest) {
  const firstEmployee = row.employees[0];
  if (!firstEmployee) {
    return "-";
  }

  return row.employees.length > 1 ? `${firstEmployee.employeeCode} +${row.employees.length - 1}` : firstEmployee.employeeCode;
}

function formatEmployeeNameLabel(
  row: DashboardRecentRequest,
  t: (key: string, values?: Record<string, string | number>) => string,
) {
  const firstEmployee = row.employees[0];
  if (!firstEmployee) {
    return "-";
  }

  return row.employees.length > 1
    ? `${firstEmployee.employeeName} ${t("plus_more", { count: row.employees.length - 1 })}`
    : firstEmployee.employeeName;
}

type DashboardPageLoaderData = Awaited<ReturnType<typeof loadDashboardPageData>> & {
  session: {
    emp_id: string;
    role: string | null;
  };
  dashboardMessages: Awaited<ReturnType<typeof loadDashboardMessages>>["messages"];
  requestMessages: Awaited<ReturnType<typeof loadRequestMessages>>["messages"];
  scope: {
    kind: "all" | "department" | "none";
    departmentName: string | null;
  };
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const calendarOnly = url.searchParams.get("calendarOnly") === "1";
  let session: Awaited<ReturnType<typeof requireRequestAdminSession>>;

  try {
    session = await requireRequestAdminSession(request, context);
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    console.error("admin.dashboard loader preflight failed:", error);
    throw new Response("ADMIN_DASHBOARD_PREFLIGHT_FAILED", { status: 500 });
  }

  if (calendarOnly) {
    try {
      const scope = await resolveDashboardScope(session);
      const range = parseRequestedCalendarRange(
        url.searchParams.get("calendarStart"),
        url.searchParams.get("calendarEnd"),
      );

      return {
        calendarWindow: await loadCalendarWindow(scope, range),
      };
    } catch (error) {
      if (error instanceof Response) {
        throw error;
      }
      console.error("admin.dashboard calendar loader query failed:", error);
      throw new Response("ADMIN_DASHBOARD_CALENDAR_QUERY_FAILED", { status: 500 });
    }
  }

  let dashboardMessages: Awaited<ReturnType<typeof loadDashboardMessages>>["messages"];
  let requestMessages: Awaited<ReturnType<typeof loadRequestMessages>>["messages"];

  try {
    [{ messages: dashboardMessages }, { messages: requestMessages }] = await Promise.all([
      loadDashboardMessages(request),
      loadRequestMessages(request),
    ]);
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    console.error("admin.dashboard loader messages failed:", error);
    throw new Response("ADMIN_DASHBOARD_MESSAGES_FAILED", { status: 500 });
  }

  try {
    const scope = await resolveDashboardScope(session);
    const pageData = await loadDashboardPageData(scope);

    return {
      session: {
        emp_id: session.emp_id,
        role: session.role,
      },
      dashboardMessages,
      requestMessages,
      scope: {
        kind: scope.kind,
        departmentName: scope.departmentName,
      },
      ...pageData,
    } satisfies DashboardPageLoaderData;
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    console.error("admin.dashboard loader query failed:", error);
    throw new Response("ADMIN_DASHBOARD_QUERY_FAILED", { status: 500 });
  }
}

export default function AdminDashboardPage({ loaderData }: Route.ComponentProps) {
  const pageData = loaderData as DashboardPageLoaderData;
  const { locale, formatNumber } = useI18n();
  const { t } = useDashboardTranslation(pageData.dashboardMessages);
  const { t: requestT } = useRequestTranslation(pageData.requestMessages);

  const scopeLabel =
    pageData.scope.kind === "all"
      ? t("scope_all")
      : pageData.scope.kind === "department"
        ? t("scope_department", { name: pageData.scope.departmentName || "-" })
        : t("scope_unassigned");

  const metricCards = [
    {
      key: "card_employees",
      value: pageData.metrics.employeeCount,
      accentClassName: "from-slate-700 to-slate-900",
      chipClassName: "bg-slate-100 text-slate-700",
    },
    {
      key: "card_on_leave",
      value: pageData.metrics.onLeaveToday,
      accentClassName: "from-sky-500 to-cyan-500",
      chipClassName: "bg-sky-100 text-sky-700",
    },
    {
      key: "card_absent",
      value: pageData.metrics.absentToday,
      accentClassName: "from-rose-500 to-red-500",
      chipClassName: "bg-rose-100 text-rose-700",
    },
    {
      key: "card_pending",
      value: pageData.metrics.pendingCount,
      accentClassName: "from-amber-400 to-orange-500",
      chipClassName: "bg-amber-100 text-amber-700",
    },
  ];

  const summaryCards = [
    {
      key: "status_pending",
      hintKey: "summary_pending_hint",
      value: pageData.statusSummary.pending,
      className: "border-amber-200 bg-amber-50 text-amber-800",
    },
    {
      key: "status_approved",
      hintKey: "summary_approved_hint",
      value: pageData.statusSummary.approved,
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    },
    {
      key: "status_rejected",
      hintKey: "summary_rejected_hint",
      value: pageData.statusSummary.rejected,
      className: "border-rose-200 bg-rose-50 text-rose-800",
    },
  ];

  return (
    <AdminShell title="Dashboard" session={pageData.session}>
      <div className="space-y-4">
        <section className="overflow-hidden rounded-[28px] border border-[#d8dee8] bg-[linear-gradient(135deg,#ffffff_0%,#f4f8ff_58%,#eef6ff_100%)] shadow-sm">
          <div className="grid gap-5 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_280px] lg:items-start">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#7c8ba1]">TD ONE ERP</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.03em] text-[#102033]">{t("title")}</h2>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[#5b6d85]">{t("dashboard_description")}</p>
            </div>
            <div className="rounded-[24px] border border-white/70 bg-white/80 p-4 shadow-[0_12px_24px_rgba(15,23,42,0.05)] backdrop-blur">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#7c8ba1]">{t("scope_caption")}</p>
              <p className="mt-2 text-base font-semibold text-[#1b2738]">{scopeLabel}</p>
              <p className="mt-2 text-sm text-[#6b7a90]">{t("scope_description")}</p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {metricCards.map((card) => (
            <article key={card.key} className="overflow-hidden rounded-[24px] border border-[#d8dee8] bg-white shadow-sm">
              <div className={`h-1.5 bg-gradient-to-r ${card.accentClassName}`} />
              <div className="p-5">
                <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${card.chipClassName}`}>
                  {t(card.key)}
                </span>
                <p className="mt-4 text-4xl font-semibold tracking-[-0.04em] text-[#102033]">
                  {formatNumber(card.value)}
                </p>
              </div>
            </article>
          ))}
        </section>

        <section className="rounded-[24px] border border-[#d8dee8] bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6ebf2] px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-[#1b2738]">{t("request_summary")}</h2>
              <p className="mt-1 text-sm text-[#6b7a90]">{t("summary_description")}</p>
            </div>
            <span className="inline-flex rounded-full bg-[#eef2ff] px-3 py-1.5 text-xs font-semibold text-[#4338ca]">
              {t("this_month")}
            </span>
          </div>
          <div className="grid gap-3 px-5 py-5 md:grid-cols-3">
            {summaryCards.map((card) => (
              <article key={card.key} className={`rounded-[22px] border p-4 ${card.className}`}>
                <p className="text-sm font-semibold">{t(card.key)}</p>
                <p className="mt-3 text-4xl font-semibold tracking-[-0.04em]">{formatNumber(card.value)}</p>
                <p className="mt-3 text-sm opacity-80">{t(card.hintKey)}</p>
              </article>
            ))}
          </div>
        </section>

        <LeaveCalendar
          endpoint="/admin/dashboard"
          initialDate={pageData.todayIso}
          initialWindow={pageData.calendarWindow}
          locale={locale}
          requestT={requestT}
          t={t}
        />

        <section className="overflow-hidden rounded-[24px] border border-[#d8dee8] bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6ebf2] px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-[#1b2738]">{t("recent_requests")}</h2>
              <p className="mt-1 text-sm text-[#6b7a90]">{t("recent_description")}</p>
            </div>
            <Link
              to="/admin/requests"
              className="inline-flex items-center rounded-full border border-[#d8dee8] px-3 py-1.5 text-sm font-semibold text-[#1d2b40] hover:bg-[#f8fafc]"
            >
              {t("view_all")} →
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-sm">
              <thead className="bg-[#f8fafc] text-[#7c8ba1]">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold">{t("col_employee")}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold">{t("col_name")}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold">{t("col_type")}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold">{t("col_status")}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold">{t("col_date")}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold">{t("col_created")}</th>
                </tr>
              </thead>
              <tbody>
                {pageData.recentRequests.map((row) => (
                  <tr key={row.id} className="border-t border-[#edf1f7]">
                    <td className="px-5 py-4 font-medium text-[#1b2738]">{formatEmployeeCodeLabel(row)}</td>
                    <td className="px-5 py-4 text-[#475569]">{formatEmployeeNameLabel(row, t)}</td>
                    <td className="px-5 py-4 text-[#475569]">{requestT(`types.${row.requestType}`)}</td>
                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                          REQUEST_STATUS_CLASSNAMES[row.status]
                        }`}
                      >
                        {requestT(`statuses.${row.status}`)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-[#475569]">{formatRequestDateRange(row, locale)}</td>
                    <td className="px-5 py-4 text-[#7c8ba1]">{formatRelativeTime(row.createdAt, t)}</td>
                  </tr>
                ))}

                {pageData.recentRequests.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-8 text-center text-sm text-[#8a97ac]">
                      {t("no_recent")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
