import { getPrisma } from "@/lib/prisma";
import { resolveEmployeeByCode } from "@/lib/employeeResolver";

const OT_MAX_HOURS_PER_DAY = Number(process.env.OT_MAX_HOURS_PER_DAY || 4);
const OT_MIN_HOURS = 1;
const OT_MAX_PAST_DAYS = Number(process.env.OT_MAX_PAST_DAYS || 7);

function toBangkokDateParts(date) {
  const tzDate = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const y = tzDate.getFullYear();
  const m = String(tzDate.getMonth() + 1).padStart(2, "0");
  const d = String(tzDate.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseTimeToMinutes(timeText) {
  const text = String(timeText || "").trim();
  const m = text.match(/^(\d{2}):(\d{2})$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return null;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

export function calculateOtHours(startTime, endTime) {
  const startMinutes = parseTimeToMinutes(startTime);
  const endMinutes = parseTimeToMinutes(endTime);

  if (startMinutes === null || endMinutes === null) {
    return { ok: false, error: "INVALID_TIME" };
  }

  if (startMinutes === endMinutes) {
    return { ok: false, error: "INVALID_TIME_RANGE" };
  }

  let durationMinutes = endMinutes - startMinutes;
  let crossMidnight = false;
  if (durationMinutes < 0) {
    durationMinutes += 24 * 60;
    crossMidnight = true;
  }

  const totalHours = Number((durationMinutes / 60).toFixed(2));
  return { ok: true, totalHours, crossMidnight };
}

export function validateOtDate(dateText) {
  const date = String(dateText || "").trim();
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, error: "INVALID_DATE" };
  }

  const now = new Date();
  const today = toBangkokDateParts(now);
  const selected = new Date(`${date}T00:00:00+07:00`);
  const current = new Date(`${today}T00:00:00+07:00`);
  const diffDays = Math.floor((current.getTime() - selected.getTime()) / (24 * 60 * 60 * 1000));

  if (date > today) {
    return { ok: false, error: "FUTURE_DATE_NOT_ALLOWED", today };
  }

  if (diffDays > OT_MAX_PAST_DAYS) {
    return { ok: false, error: "DATE_TOO_OLD", maxPastDays: OT_MAX_PAST_DAYS };
  }

  return { ok: true, today };
}

export async function getEmployeeByEmpCode(empCode) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  return resolveEmployeeByCode(prisma, empCode);
}

export async function getOtTypeByCode(code) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  try {
    const otType = await prisma.otType.findFirst({
      where: { code, is_active: true },
      select: { code: true, name_lo: true, name_th: true, name_en: true, rate_multiplier: true },
    });
    return { otType: otType || null, error: null };
  } catch (err) {
    return { otType: null, error: err };
  }
}

export async function hasLeaveOnDate(employeeId, dateText) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  try {
    const leaves = await prisma.leaveRequest.findMany({
      where: {
        employee_id: employeeId,
        start_date: { lte: dateText },
        end_date: { gte: dateText },
        status: { in: ["approved", "pending"] },
      },
      select: { id: true },
      take: 1,
    });
    return { conflict: leaves.length > 0, skipped: false };
  } catch {
    return { conflict: false, skipped: true };
  }
}

export async function findExistingOtOnDate(employeeId, dateText) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  try {
    const rows = await prisma.otRequest.findMany({
      where: {
        employee_id: employeeId,
        date: dateText,
        status: { not: "cancelled" },
      },
      select: { id: true, status: true, total_hours: true, ot_type_code: true, start_time: true, end_time: true },
      orderBy: { created_at: "desc" },
    });
    return { rows, error: null };
  } catch (err) {
    return { rows: [], error: err };
  }
}

export function getOtLimits() {
  return {
    minHours: OT_MIN_HOURS,
    maxHours: OT_MAX_HOURS_PER_DAY,
    maxPastDays: OT_MAX_PAST_DAYS,
  };
}
