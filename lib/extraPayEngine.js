/**
 * extraPayEngine.js
 * --------------------------------------------------
 * Core calculation engine for extra pay (OT, PieceWork, Holiday pay).
 *
 * Business Rules:
 *  - Day period:   06:00 – 22:00 (16 hours)
 *  - Night period: 22:00 – 06:00 (8 hours, wraps midnight)
 *
 * Pay Types (site_pay_rates.pay_type):
 *  OT_NORMAL_DAY    – OT during normal work day, day hours  → multiplier × hourly_rate
 *  OT_NORMAL_NIGHT  – OT during normal work day, night hours → multiplier × hourly_rate
 *  PIECE_WORK_DAY   – piece work during day hours  → multiplier × hourly_rate
 *  PIECE_WORK_NIGHT – piece work during night hours → multiplier × hourly_rate
 *  HOLIDAY_DAY      – work on public holiday, day hours → multiplier × hourly_rate
 *  HOLIDAY_NIGHT    – work on public holiday, night hours → multiplier × hourly_rate
 *  LUNCH_OT         – fixed or multiplier for lunch period work
 *  NIGHT_ALLOWANCE  – fixed per-shift night bonus (not hourly)
 */

import { supabaseServer } from '@/lib/supabaseServer';
import { calculateHourlyRate } from '@/lib/hourlyRateService';
import { isEmployeeWorkDay } from '@/lib/shiftService';

// ─────────────────────────────────────────────────────────────────────────────
// Time utilities
// ─────────────────────────────────────────────────────────────────────────────

const DAY_START_MINUTES = 6 * 60;    // 06:00
const DAY_END_MINUTES   = 22 * 60;   // 22:00

/**
 * Convert "HH:MM" string to total minutes since midnight.
 */
export function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Convert minutes since midnight to "HH:MM".
 */
export function minutesToTime(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/**
 * Split a time interval [startMin, endMin) into day-hours and night-hours.
 *
 * Handles cross-midnight spans.
 * All values in minutes since midnight of the START date.
 *
 * @param {number} startMin  minutes since midnight
 * @param {number} endMin    minutes since midnight (may be > 1440 if crosses midnight)
 * @returns {{ dayMinutes: number, nightMinutes: number }}
 */
export function splitDayNight(startMin, endMin) {
  // Normalise: work in a 48-hour window (two days) to handle night crossings
  let dayMinutes = 0;
  let nightMinutes = 0;

  const segments = buildDaySegments(startMin, endMin);
  for (const { from, to } of segments) {
    const normFrom = ((from % 1440) + 1440) % 1440;
    const normTo = normFrom + (to - from);

    dayMinutes += intersectMinutes(normFrom, normTo, DAY_START_MINUTES, DAY_END_MINUTES);
    nightMinutes += intersectMinutes(normFrom, normTo, DAY_END_MINUTES, DAY_START_MINUTES + 1440);
    // Also handle night before 06:00 (0 - 360)
    nightMinutes += intersectMinutes(normFrom, normTo, 0, DAY_START_MINUTES);
  }

  return { dayMinutes, nightMinutes };
}

/**
 * When a span crosses exactly one midnight, break into two same-day pieces.
 */
function buildDaySegments(startMin, endMin) {
  if (endMin <= startMin) endMin += 1440; // wrap
  if (endMin <= 1440) return [{ from: startMin, to: endMin }];
  // crosses midnight
  return [
    { from: startMin, to: 1440 },
    { from: 1440, to: endMin },
  ];
}

function intersectMinutes(startA, endA, startB, endB) {
  const start = Math.max(startA, startB);
  const end = Math.min(endA, endB);
  return Math.max(0, end - start);
}

// ─────────────────────────────────────────────────────────────────────────────
// Pay rate lookup
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch site pay rates for the employee's work site, active on a given date.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} workSiteId
 * @param {string} dateStr "YYYY-MM-DD"
 * @returns {Promise<Record<string, { multiplier: number, fixed_amount: number|null, calculation_method: string }>>}
 */
async function getSitePayRates(supabase, workSiteId, dateStr) {
  const { data, error } = await supabase
    .from('site_pay_policies')
    .select(`
      id,
      site_pay_rates(pay_type, multiplier, fixed_amount, calculation_method)
    `)
    .eq('work_site_id', workSiteId)
    .lte('effective_from', dateStr)
    .or(`effective_to.is.null,effective_to.gte.${dateStr}`)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getSitePayRates: ${error.message}`);
  if (!data) return {};

  return Object.fromEntries(data.site_pay_rates.map((r) => [r.pay_type, r]));
}

/**
 * Check if a date is a public holiday.
 */
async function isPublicHoliday(supabase, dateStr) {
  const { data, error } = await supabase
    .from('public_holidays')
    .select('id, holiday_name')
    .eq('holiday_date', dateStr)
    .eq('country_code', 'LA')
    .maybeSingle();

  if (error) throw new Error(`isPublicHoliday: ${error.message}`);
  return { isHoliday: !!data, name: data?.holiday_name ?? null };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main engine
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate extra pay for a single work entry.
 *
 * @param {{
 *   employeeId: string,
 *   workDate: string,
 *   clockIn: string,       // "HH:MM"
 *   clockOut: string,      // "HH:MM" (may cross midnight)
 *   requestType: 'OT'|'PIECE_WORK'|'HOLIDAY'|'LUNCH_OT',
 *   pieces: number|null,   // for piece-work if calculated per piece
 * }} params
 *
 * @returns {Promise<ExtraPayResult>}
 */
export async function calculateExtraPay({
  employeeId,
  workDate,
  clockIn,
  clockOut,
  requestType = 'OT',
  pieces = null,
}) {
    const supabase = supabaseServer;

  // Determine year/month for hourly rate calculation
  const [year, month] = workDate.split('-').map(Number);

  const [rateInfo, { isWorkDay, shiftType }, { isHoliday, name: holidayName }] = await Promise.all([
    calculateHourlyRate(employeeId, year, month),
    isEmployeeWorkDay(employeeId, workDate),
    isPublicHoliday(supabase, workDate),
  ]);

  // Fetch employee's work site
  const { data: paySettings } = await supabase
    .from('employee_payroll_settings')
    .select('work_site_id')
    .eq('employee_id', employeeId)
    .maybeSingle();

  const workSiteId = paySettings?.work_site_id;
  const payRates = workSiteId ? await getSitePayRates(supabase, workSiteId, workDate) : {};

  // Parse clock times
  const startMin = timeToMinutes(clockIn);
  let endMin = timeToMinutes(clockOut);
  if (endMin <= startMin) endMin += 1440;

  const totalMinutes = endMin - startMin;
  const totalHours = totalMinutes / 60;

  // Day/night split
  const { dayMinutes, nightMinutes } = splitDayNight(startMin, endMin);
  const dayHours = dayMinutes / 60;
  const nightHours = nightMinutes / 60;

  // Determine pay type prefixes based on conditions
  const isHolidayWork = isHoliday || (requestType === 'HOLIDAY');
  const isPieceWork = requestType === 'PIECE_WORK';
  const isLunchOT = requestType === 'LUNCH_OT';

  let prefix;
  if (isHolidayWork) prefix = 'HOLIDAY';
  else if (isPieceWork) prefix = 'PIECE_WORK';
  else prefix = 'OT_NORMAL';

  const dayPayType = `${prefix}_DAY`;
  const nightPayType = `${prefix}_NIGHT`;

  // Calculate amounts
  const dayRate = payRates[dayPayType];
  const nightRate = payRates[nightPayType];
  const hourlyRate = rateInfo.hourlyRate;

  let dayAmount = 0;
  let nightAmount = 0;

  if (isLunchOT) {
    const lunchRate = payRates['LUNCH_OT'];
    const calc = lunchRate?.calculation_method ?? 'multiplier';
    if (calc === 'fixed' && lunchRate?.fixed_amount) {
      dayAmount = lunchRate.fixed_amount;
    } else {
      const mult = lunchRate?.multiplier ?? 1;
      dayAmount = Math.round(hourlyRate * mult * totalHours);
    }
  } else {
    if (dayHours > 0 && dayRate) {
      const calc = dayRate.calculation_method ?? 'multiplier';
      if (calc === 'fixed') {
        dayAmount = dayRate.fixed_amount ?? 0;
      } else {
        dayAmount = Math.round(hourlyRate * (dayRate.multiplier ?? 1) * dayHours);
      }
    }

    if (nightHours > 0 && nightRate) {
      const calc = nightRate.calculation_method ?? 'multiplier';
      if (calc === 'fixed') {
        nightAmount = nightRate.fixed_amount ?? 0;
      } else {
        nightAmount = Math.round(hourlyRate * (nightRate.multiplier ?? 1) * nightHours);
      }
    }
  }

  // Night allowance (fixed per shift if employee works any night hours)
  let nightAllowance = 0;
  if (nightHours > 0 && payRates['NIGHT_ALLOWANCE']) {
    const na = payRates['NIGHT_ALLOWANCE'];
    nightAllowance = na.fixed_amount ?? Math.round(hourlyRate * (na.multiplier ?? 0) * nightHours);
  }

  const totalAmount = dayAmount + nightAmount + nightAllowance;

  return {
    employeeId,
    workDate,
    clockIn,
    clockOut,
    requestType,
    isHolidayWork,
    holidayName,
    isWorkDay,
    totalMinutes,
    totalHours: Math.round(totalHours * 100) / 100,
    dayHours: Math.round(dayHours * 100) / 100,
    nightHours: Math.round(nightHours * 100) / 100,
    hourlyRate,
    dayPayType,
    nightPayType,
    dayMultiplier: payRates[dayPayType]?.multiplier ?? null,
    nightMultiplier: payRates[nightPayType]?.multiplier ?? null,
    dayAmount,
    nightAmount,
    nightAllowance,
    totalAmount,
    currency: 'LAK',
    rateBreakdown: rateInfo,
  };
}

/**
 * Calculate extra pay for a batch of requests (for payroll OT run).
 *
 * @param {string[]} requestIds  UUIDs of approved extra_pay_requests
 * @returns {Promise<Array<ExtraPayResult & { requestId: string }>>}
 */
export async function batchCalculateExtraPay(requestIds) {
  const supabase = supabaseServer;

  const { data: requests, error } = await supabase
    .from('extra_pay_requests')
    .select('id, employee_id, work_date, planned_clock_in, planned_clock_out, request_type')
    .in('id', requestIds)
    .eq('status', 'approved');

  if (error) throw new Error(`batchCalculateExtraPay: ${error.message}`);

  return Promise.all(
    requests.map(async (req) => {
      try {
        const result = await calculateExtraPay({
          employeeId: req.employee_id,
          workDate: req.work_date,
          clockIn: req.planned_clock_in,
          clockOut: req.planned_clock_out,
          requestType: req.request_type,
        });
        return { ...result, requestId: req.id };
      } catch (err) {
        return { requestId: req.id, error: err.message, totalAmount: 0 };
      }
    })
  );
}

/**
 * Summarise extra pay records by pay type for a month (for OT payroll run).
 *
 * @param {string} employeeId
 * @param {string} periodMonth "YYYY-MM"
 */
export async function getExtraPaySummaryForEmployee(employeeId, periodMonth) {
  const supabase = supabaseServer;

  const [year, month] = periodMonth.split('-').map(Number);
  const from = `${periodMonth}-01`;
  const to = new Date(year, month, 0).toISOString().slice(0, 10); // last day of month

  const { data, error } = await supabase
    .from('extra_pay_records')
    .select('pay_type, hours, amount')
    .eq('employee_id', employeeId)
    .gte('work_date', from)
    .lte('work_date', to);

  if (error) throw new Error(`getExtraPaySummaryForEmployee: ${error.message}`);

  /** @type {Record<string, { hours: number, amount: number }>} */
  const summary = {};
  for (const r of data) {
    if (!summary[r.pay_type]) summary[r.pay_type] = { hours: 0, amount: 0 };
    summary[r.pay_type].hours += r.hours ?? 0;
    summary[r.pay_type].amount += r.amount ?? 0;
  }

  return {
    employeeId,
    periodMonth,
    byType: summary,
    totalAmount: Object.values(summary).reduce((s, v) => s + v.amount, 0),
  };
}
