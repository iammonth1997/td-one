/**
 * shiftService.js
 * --------------------------------------------------
 * Rotation shift schedule calculator for TDOne ERP.
 *
 * Core concept:
 *   Each employee has a shift_assignment with:
 *     - cycle_start_date : the anchor date when the cycle starts (day 1)
 *     - shift_pattern    : work_days / rest_days (e.g. 30/10, 28/14)
 *     - shift_type       : day (06-18) or night (18-06)
 *
 *  For any given date:
 *    dayIndex = (date - cycle_start_date) % cycle_total_days
 *    if dayIndex < work_days  → WORK day
 *    else                     → REST day
 */

import { supabaseServer } from '@/lib/supabaseServer';

/**
 * Given a UTC date string or Date object and a cycle_start_date, returns
 * whether the employee should be working on that date, and how far
 * into the work-block they are.
 *
 * @param {Date|string} targetDate
 * @param {Date|string} cycleStartDate
 * @param {number} workDays
 * @param {number} restDays
 * @returns {{ isWorkDay: boolean, cycleDay: number, blockDay: number }}
 */
export function getDayInCycle(targetDate, cycleStartDate, workDays, restDays) {
  const target = new Date(targetDate);
  const start = new Date(cycleStartDate);

  // Normalize to midnight UTC to avoid DST/timezone issues
  const targetNorm = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const startNorm = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());

  const diffMs = targetNorm - startNorm;
  const diffDays = Math.round(diffMs / 86_400_000); // ms per day

  if (diffDays < 0) return { isWorkDay: false, cycleDay: null, blockDay: null };

  const cycleTotal = workDays + restDays;
  const cycleDay = diffDays % cycleTotal;          // 0-indexed position in cycle
  const isWorkDay = cycleDay < workDays;
  const blockDay = isWorkDay ? cycleDay + 1 : cycleDay - workDays + 1;

  return { isWorkDay, cycleDay, blockDay };
}

/**
 * Get the current active shift assignment for an employee.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} employeeId UUID
 * @param {string} [asOf] ISO date string (default: today)
 */
export async function getActiveShiftAssignment(supabase, employeeId, asOf = null) {
  asOf = asOf ?? new Date().toISOString().slice(0, 10);
  const targetDate = asOf;

  const { data, error } = await supabase
    .from('employee_shift_assignments')
    .select(`
      id,
      cycle_start_date,
      effective_from,
      effective_to,
      shift_pattern:shift_patterns(
        id, pattern_name, work_days, rest_days, cycle_total_days, work_hours_per_day
      ),
      shift_type:shift_types(
        id, type_name, start_time, end_time, crosses_midnight,
        break_minutes, is_night_shift, grace_minutes
      )
    `)
    .eq('employee_id', employeeId)
    .lte('effective_from', targetDate)
    .or(`effective_to.is.null,effective_to.gte.${targetDate}`)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getActiveShiftAssignment: ${error.message}`);
  return data;
}

/**
 * Build a full month schedule for one employee.
 *
 * @param {string} employeeId  UUID
 * @param {number} year        e.g. 2026
 * @param {number} month       1-12
 * @returns {Promise<Array<{ date: string, isWorkDay: boolean, shiftType: object|null, blockDay: number }>>}
 */
export async function getEmployeeMonthSchedule(employeeId, year, month) {
  const supabase = supabaseServer;
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0); // last day of month
  const lastDayStr = lastDay.toISOString().slice(0, 10);

  const assignment = await getActiveShiftAssignment(supabase, employeeId, firstDay);
  if (!assignment) return [];

  const { shift_pattern: pattern, shift_type: shiftType, cycle_start_date } = assignment;
  const days = lastDay.getDate();
  const schedule = [];

  for (let d = 1; d <= days; d++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const { isWorkDay, cycleDay, blockDay } = getDayInCycle(
      dateStr,
      cycle_start_date,
      pattern.work_days,
      pattern.rest_days
    );
    schedule.push({
      date: dateStr,
      isWorkDay,
      cycleDay,
      blockDay,
      shiftType: isWorkDay ? shiftType : null,
      patternName: pattern.pattern_name,
      workHoursPerDay: pattern.work_hours_per_day,
    });
  }

  return schedule;
}

/**
 * Count expected work days in a given month for an employee.
 *
 * @param {string} employeeId
 * @param {number} year
 * @param {number} month 1-12
 * @returns {Promise<{ workDays: number, restDays: number, totalDays: number }>}
 */
export async function countWorkDaysInMonth(employeeId, year, month) {
  const schedule = await getEmployeeMonthSchedule(employeeId, year, month);
  const workDays = schedule.filter((d) => d.isWorkDay).length;
  return { workDays, restDays: schedule.length - workDays, totalDays: schedule.length };
}

/**
 * Check if a specific date is a work day for an employee.
 *
 * @param {string} employeeId
 * @param {string} dateStr "YYYY-MM-DD"
 * @returns {Promise<{ isWorkDay: boolean, shiftType: object|null }>}
 */
export async function isEmployeeWorkDay(employeeId, dateStr) {
  const supabase = supabaseServer;
  const assignment = await getActiveShiftAssignment(supabase, employeeId, dateStr);
  if (!assignment) return { isWorkDay: false, shiftType: null };

  const { shift_pattern: pattern, shift_type: shiftType, cycle_start_date } = assignment;
  const { isWorkDay } = getDayInCycle(dateStr, cycle_start_date, pattern.work_days, pattern.rest_days);
  return { isWorkDay, shiftType: isWorkDay ? shiftType : null };
}

/**
 * List all employees on a given shift assignment on a specific date.
 * Useful for admin dashboard / roster views.
 */
export async function getRosterByDate(dateStr) {
  const supabase = supabaseServer;

  // Fetch all assignments that cover this date
  const { data: assignments, error } = await supabase
    .from('employee_shift_assignments')
    .select(`
      employee_id,
      cycle_start_date,
      shift_pattern:shift_patterns(work_days, rest_days, pattern_name, work_hours_per_day),
      shift_type:shift_types(type_name, start_time, end_time, is_night_shift)
    `)
    .lte('effective_from', dateStr)
    .or(`effective_to.is.null,effective_to.gte.${dateStr}`);

  if (error) throw new Error(`getRosterByDate: ${error.message}`);

  const working = [];
  const resting = [];

  for (const a of assignments) {
    const { isWorkDay } = getDayInCycle(
      dateStr,
      a.cycle_start_date,
      a.shift_pattern.work_days,
      a.shift_pattern.rest_days
    );
    if (isWorkDay) {
      working.push({ ...a, date: dateStr });
    } else {
      resting.push({ ...a, date: dateStr });
    }
  }

  return { working, resting };
}
