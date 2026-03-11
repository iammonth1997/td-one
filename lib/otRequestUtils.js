import { supabaseServer } from "@/lib/supabaseServer";

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
  const { data, error } = await supabaseServer
    .from("employees")
    .select("id, employee_code")
    .eq("employee_code", empCode)
    .maybeSingle();

  if (error) return { employee: null, error };
  return { employee: data || null, error: null };
}

export async function getOtTypeByCode(code) {
  const { data, error } = await supabaseServer
    .from("ot_types")
    .select("code, name_lo, name_th, name_en, rate_multiplier")
    .eq("code", code)
    .eq("is_active", true)
    .maybeSingle();

  if (error) return { otType: null, error };
  return { otType: data || null, error: null };
}

export async function hasLeaveOnDate(employeeId, dateText) {
  try {
    const { data, error } = await supabaseServer
      .from("leave_requests")
      .select("id")
      .eq("employee_id", employeeId)
      .lte("start_date", dateText)
      .gte("end_date", dateText)
      .in("status", ["approved", "pending"])
      .limit(1);

    if (error) {
      if (error.code === "42P01") {
        return { conflict: false, skipped: true };
      }
      return { conflict: false, error };
    }

    return { conflict: Boolean(data?.length), skipped: false };
  } catch {
    return { conflict: false, skipped: true };
  }
}

export async function findExistingOtOnDate(employeeId, dateText) {
  const { data, error } = await supabaseServer
    .from("ot_requests")
    .select("id, status, total_hours, ot_type_code, start_time, end_time")
    .eq("employee_id", employeeId)
    .eq("date", dateText)
    .neq("status", "cancelled")
    .order("created_at", { ascending: false });

  if (error) return { rows: [], error };
  return { rows: data || [], error: null };
}

export function getOtLimits() {
  return {
    minHours: OT_MIN_HOURS,
    maxHours: OT_MAX_HOURS_PER_DAY,
    maxPastDays: OT_MAX_PAST_DAYS,
  };
}
