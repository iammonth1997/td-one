import { Prisma } from "@prisma/client";

import prisma from "~/lib/prisma.server";
import { getDashboardScope, type DashboardScope } from "~/lib/dashboard-scope";
import type { RequestAdminSession } from "~/lib/request-admin-session.server";
import type { RequestStatus } from "~/lib/request-types";

const BUSINESS_TIME_ZONE = "Asia/Bangkok";
const MAX_CALENDAR_RANGE_DAYS = 120;

const ACTIVE_EMPLOYEE_STATUSES = ["พนักงาน", "ACTIVE"] as const;
const LEAVE_REQUEST_TYPES = [
  "SICK_LEAVE",
  "PERSONAL_LEAVE",
  "ANNUAL_LEAVE",
  "UNPAID_LEAVE",
  "MATERNITY_LEAVE",
] as const;
const CALENDAR_VISIBLE_STATUSES = ["APPROVED", "SUBMITTED"] as const;

type CountRow = {
  count: number;
};

type StatusCountRow = {
  status: string;
  count: number;
};

type CalendarQueryRow = {
  id: string;
  request_type: string;
  status: string;
  start_date: Date | null;
  end_date: Date | null;
  last_working_day: Date | null;
  work_dates: Prisma.JsonValue | null;
  employee_id: string;
  employee_code: string;
  employee_name: string;
};

type CalendarRange = {
  start: string;
  end: string;
};

export type DashboardMetrics = {
  employeeCount: number;
  onLeaveToday: number;
  absentToday: number;
  pendingCount: number;
};

export type DashboardStatusSummary = {
  pending: number;
  approved: number;
  rejected: number;
};

export type DashboardRecentRequest = {
  id: string;
  requestType: string;
  status: RequestStatus;
  createdAt: string;
  startDate: string | null;
  endDate: string | null;
  lastWorkingDay: string | null;
  workDates: string[];
  employees: Array<{
    employeeCode: string;
    employeeName: string;
  }>;
};

export type DashboardCalendarEvent = {
  id: string;
  requestId: string;
  requestType: string;
  date: string;
  employeeCode: string;
  employeeName: string;
};

export type DashboardCalendarWindow = {
  start: string;
  end: string;
  events: DashboardCalendarEvent[];
};

function formatIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseIsoDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 12);
}

function addDays(value: string, amount: number) {
  const next = parseIsoDate(value);
  next.setDate(next.getDate() + amount);
  return formatIsoDate(next);
}

function startOfMonth(value: string) {
  const date = parseIsoDate(value);
  date.setDate(1);
  return formatIsoDate(date);
}

function endOfMonth(value: string) {
  const date = parseIsoDate(value);
  date.setMonth(date.getMonth() + 1, 0);
  return formatIsoDate(date);
}

function startOfWeek(value: string) {
  const date = parseIsoDate(value);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return formatIsoDate(date);
}

function endOfWeek(value: string) {
  return addDays(startOfWeek(value), 6);
}

function differenceInDays(start: string, end: string) {
  const startDate = parseIsoDate(start);
  const endDate = parseIsoDate(end);
  return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
}

function isIsoDate(value: string | null | undefined): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function coerceCount(value: number | bigint | null | undefined) {
  return Number(value ?? 0) || 0;
}

function employeeDisplayName(employee: {
  first_name: string | null;
  last_name: string | null;
  full_name_en: string | null;
  full_name_lo: string | null;
  employee_id: string;
}) {
  const joined = [employee.first_name, employee.last_name].filter(Boolean).join(" ").trim();
  return joined || employee.full_name_lo || employee.full_name_en || employee.employee_id;
}

function requestDepartmentCondition(scope: DashboardScope, alias: string) {
  if (scope.kind === "all") {
    return Prisma.empty;
  }

  if (scope.kind === "department") {
    return Prisma.sql`AND ${Prisma.raw(alias)}.department_id = ${scope.departmentFilter}`;
  }

  return Prisma.sql`AND 1 = 0`;
}

function scopedRequestWhere(scope: DashboardScope): Prisma.RequestWhereInput {
  if (scope.kind === "all") {
    return {};
  }

  if (scope.kind === "department") {
    return {
      department_id: scope.departmentFilter,
    };
  }

  return {
    department_id: -1,
  };
}

function scopedEmployeeWhere(scope: DashboardScope): Prisma.EmployeeWhereInput {
  if (scope.kind === "all") {
    return {};
  }

  if (scope.kind === "department") {
    return {
      department_id: scope.departmentFilter,
    };
  }

  return {
    department_id: -1,
  };
}

function getTodayIsoInBusinessTime(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";
  return `${year}-${month}-${day}`;
}

function extractWorkDates(value: Prisma.JsonValue | null | undefined) {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
      return [];
    }

    const date = String((entry as { date?: unknown }).date || "").trim();
    return isIsoDate(date) ? [date] : [];
  });
}

function enumerateRange(start: string, end: string) {
  const values: string[] = [];
  let cursor = start;

  while (cursor <= end) {
    values.push(cursor);
    cursor = addDays(cursor, 1);
  }

  return values;
}

function expandCalendarRow(row: CalendarQueryRow, range: CalendarRange) {
  if (row.request_type === "PIECE_WORK") {
    return extractWorkDates(row.work_dates)
      .filter((value) => value >= range.start && value <= range.end)
      .map((date) => ({
        id: `${row.id}:${row.employee_id}:${date}`,
        requestId: row.id,
        requestType: row.request_type,
        date,
        employeeCode: row.employee_code,
        employeeName: row.employee_name,
      }));
  }

  if (row.request_type === "RESIGNATION") {
    const date = row.last_working_day ? row.last_working_day.toISOString().slice(0, 10) : null;
    if (!date || date < range.start || date > range.end) {
      return [] as DashboardCalendarEvent[];
    }

    return [
      {
        id: `${row.id}:${row.employee_id}:${date}`,
        requestId: row.id,
        requestType: row.request_type,
        date,
        employeeCode: row.employee_code,
        employeeName: row.employee_name,
      },
    ];
  }

  const startDate = row.start_date ? row.start_date.toISOString().slice(0, 10) : row.end_date ? row.end_date.toISOString().slice(0, 10) : null;
  const endDate = row.end_date ? row.end_date.toISOString().slice(0, 10) : startDate;

  if (!startDate || !endDate) {
    return [] as DashboardCalendarEvent[];
  }

  const clampedStart = startDate < range.start ? range.start : startDate;
  const clampedEnd = endDate > range.end ? range.end : endDate;
  if (clampedStart > clampedEnd) {
    return [] as DashboardCalendarEvent[];
  }

  return enumerateRange(clampedStart, clampedEnd).map((date) => ({
    id: `${row.id}:${row.employee_id}:${date}`,
    requestId: row.id,
    requestType: row.request_type,
    date,
    employeeCode: row.employee_code,
    employeeName: row.employee_name,
  }));
}

export function getInitialCalendarRange(todayIso = getTodayIsoInBusinessTime()): CalendarRange {
  const monthStart = startOfMonth(todayIso);
  const monthEnd = endOfMonth(todayIso);

  return {
    start: startOfWeek(monthStart),
    end: endOfWeek(monthEnd),
  };
}

export function parseRequestedCalendarRange(start: string | null, end: string | null, todayIso = getTodayIsoInBusinessTime()): CalendarRange {
  const fallback = getInitialCalendarRange(todayIso);
  if (!isIsoDate(start) || !isIsoDate(end) || start > end) {
    return fallback;
  }

  if (differenceInDays(start, end) > MAX_CALENDAR_RANGE_DAYS) {
    return fallback;
  }

  return { start, end };
}

export async function resolveDashboardScope(session: RequestAdminSession) {
  const departmentName =
    session.departmentId != null
      ? (
          await prisma.department.findUnique({
            where: { id: session.departmentId },
            select: { name: true },
          })
        )?.name ?? null
      : null;

  return getDashboardScope({
    role: session.role,
    departmentId: session.departmentId,
    departmentName,
  });
}

export async function loadDashboardMetrics(scope: DashboardScope, todayIso = getTodayIsoInBusinessTime()): Promise<DashboardMetrics> {
  const [employeeCount, onLeaveRows, absentRows, pendingCount] = await Promise.all([
    prisma.employee.count({
      where: {
        ...scopedEmployeeWhere(scope),
        status: {
          in: [...ACTIVE_EMPLOYEE_STATUSES],
        },
      },
    }),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(DISTINCT re.employee_id)::int AS count
      FROM requests r
      JOIN request_employees re ON re.request_id = r.id
      WHERE r.status IN (${Prisma.join([...CALENDAR_VISIBLE_STATUSES])})
        AND r.request_type IN (${Prisma.join([...LEAVE_REQUEST_TYPES])})
        AND ${todayIso}::date BETWEEN r.start_date AND r.end_date
        ${requestDepartmentCondition(scope, "r")}
    `),
    prisma.$queryRaw<CountRow[]>(Prisma.sql`
      SELECT COUNT(DISTINCT re.employee_id)::int AS count
      FROM requests r
      JOIN request_employees re ON re.request_id = r.id
      WHERE r.status = 'SUBMITTED'
        AND r.request_type = 'ABSENT'
        AND ${todayIso}::date BETWEEN r.start_date AND r.end_date
        ${requestDepartmentCondition(scope, "r")}
    `),
    prisma.request.count({
      where: {
        ...scopedRequestWhere(scope),
        status: "PENDING",
      },
    }),
  ]);

  return {
    employeeCount,
    onLeaveToday: coerceCount(onLeaveRows[0]?.count),
    absentToday: coerceCount(absentRows[0]?.count),
    pendingCount,
  };
}

export async function loadDashboardStatusSummary(scope: DashboardScope, todayIso = getTodayIsoInBusinessTime()): Promise<DashboardStatusSummary> {
  const monthStart = startOfMonth(todayIso);
  const rows = await prisma.$queryRaw<StatusCountRow[]>(Prisma.sql`
    SELECT r.status, COUNT(*)::int AS count
    FROM requests r
    WHERE (r.created_at AT TIME ZONE ${BUSINESS_TIME_ZONE})::date BETWEEN ${monthStart}::date AND ${todayIso}::date
      ${requestDepartmentCondition(scope, "r")}
    GROUP BY r.status
  `);

  return rows.reduce<DashboardStatusSummary>(
    (summary, row) => {
      const status = String(row.status || "").trim().toUpperCase();
      const count = coerceCount(row.count);

      if (status === "PENDING") {
        summary.pending += count;
      } else if (status === "REJECTED") {
        summary.rejected += count;
      } else if (status === "APPROVED" || status === "SUBMITTED") {
        summary.approved += count;
      }

      return summary;
    },
    {
      pending: 0,
      approved: 0,
      rejected: 0,
    },
  );
}

export async function loadRecentRequests(scope: DashboardScope): Promise<DashboardRecentRequest[]> {
  const rows = await prisma.request.findMany({
    where: scopedRequestWhere(scope),
    orderBy: { created_at: "desc" },
    take: 10,
    include: {
      employees: {
        orderBy: { employee_id: "asc" },
        include: {
          employee: {
            select: {
              employee_id: true,
              first_name: true,
              last_name: true,
              full_name_en: true,
              full_name_lo: true,
            },
          },
        },
      },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    requestType: row.request_type,
    status: String(row.status || "").trim().toUpperCase() as RequestStatus,
    createdAt: row.created_at.toISOString(),
    startDate: row.start_date ? row.start_date.toISOString().slice(0, 10) : null,
    endDate: row.end_date ? row.end_date.toISOString().slice(0, 10) : null,
    lastWorkingDay: row.last_working_day ? row.last_working_day.toISOString().slice(0, 10) : null,
    workDates: extractWorkDates(row.work_dates),
    employees: row.employees.map((assignment) => ({
      employeeCode: assignment.employee_id,
      employeeName: employeeDisplayName({
        ...assignment.employee,
        employee_id: assignment.employee.employee_id,
      }),
    })),
  }));
}

export async function loadCalendarWindow(scope: DashboardScope, range: CalendarRange): Promise<DashboardCalendarWindow> {
  const rows = await prisma.$queryRaw<CalendarQueryRow[]>(Prisma.sql`
    SELECT
      r.id,
      r.request_type,
      r.status,
      r.start_date,
      r.end_date,
      r.last_working_day,
      r.work_dates,
      re.employee_id,
      e.employee_id AS employee_code,
      COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', e.first_name, e.last_name)), ''),
        NULLIF(e.full_name_lo, ''),
        NULLIF(e.full_name_en, ''),
        e.employee_id
      ) AS employee_name
    FROM requests r
    JOIN request_employees re ON re.request_id = r.id
    JOIN employees e ON e.employee_id = re.employee_id
    WHERE r.status IN (${Prisma.join([...CALENDAR_VISIBLE_STATUSES])})
      ${requestDepartmentCondition(scope, "r")}
      AND (
        (
          r.request_type = 'PIECE_WORK'
          AND EXISTS (
            SELECT 1
            FROM jsonb_array_elements(COALESCE(r.work_dates::jsonb, '[]'::jsonb)) AS item
            WHERE (item->>'date')::date BETWEEN ${range.start}::date AND ${range.end}::date
          )
        )
        OR (
          r.request_type = 'RESIGNATION'
          AND r.last_working_day BETWEEN ${range.start}::date AND ${range.end}::date
        )
        OR (
          r.request_type <> 'PIECE_WORK'
          AND r.request_type <> 'RESIGNATION'
          AND COALESCE(r.start_date, r.end_date) <= ${range.end}::date
          AND COALESCE(r.end_date, r.start_date) >= ${range.start}::date
        )
      )
    ORDER BY COALESCE(r.start_date, r.last_working_day, r.created_at), e.employee_id
  `);

  return {
    start: range.start,
    end: range.end,
    events: rows.flatMap((row) => expandCalendarRow(row, range)),
  };
}

export async function loadDashboardPageData(scope: DashboardScope, todayIso = getTodayIsoInBusinessTime()) {
  const calendarRange = getInitialCalendarRange(todayIso);
  const [metrics, statusSummary, recentRequests, calendarWindow] = await Promise.all([
    loadDashboardMetrics(scope, todayIso),
    loadDashboardStatusSummary(scope, todayIso),
    loadRecentRequests(scope),
    loadCalendarWindow(scope, calendarRange),
  ]);

  return {
    metrics,
    statusSummary,
    recentRequests,
    calendarWindow,
    todayIso,
  };
}
