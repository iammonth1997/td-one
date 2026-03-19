/**
 * hourlyRateService.js
 * --------------------------------------------------
 * Calculates effective hourly and daily rates for payroll and extra-pay.
 *
 * Rules:
 *  - monthly employee: hourly_rate = base_salary / work_days_in_month / work_hours_per_day
 *  - daily employee:   hourly_rate = daily_rate  / work_hours_per_day
 *
 *  work_hours_per_day comes from the employee's current shift_type.
 *  work_days_in_month comes from shiftService.countWorkDaysInMonth().
 */

import { supabaseServer } from '@/lib/supabaseServer';
import { countWorkDaysInMonth } from '@/lib/shiftService';

const DEFAULT_WORK_HOURS = 8;

/**
 * Fetch employee payroll settings including their shift assignment.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} employeeId UUID
 */
async function getPayrollSettings(supabase, employeeId) {
  const { data, error } = await supabase
    .from('employee_payroll_settings')
    .select('*')
    .eq('employee_id', employeeId)
    .maybeSingle();

  if (error) throw new Error(`getPayrollSettings: ${error.message}`);
  return data;
}

/**
 * Fetch shift work hours from active assignment.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} employeeId
 * @param {number} year
 * @param {number} month
 */
async function getShiftHoursPerDay(supabase, employeeId, year, month) {
  const firstDay = `${year}-${String(month).padStart(2, '0')}-01`;

  const { data, error } = await supabase
    .from('employee_shift_assignments')
    .select('shift_pattern:shift_patterns(work_hours_per_day)')
    .eq('employee_id', employeeId)
    .lte('effective_from', firstDay)
    .or(`effective_to.is.null,effective_to.gte.${firstDay}`)
    .order('effective_from', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(`getShiftHoursPerDay: ${error.message}`);
  return data?.shift_pattern?.work_hours_per_day ?? DEFAULT_WORK_HOURS;
}

/**
 * Calculate employee hourly rate for a specific month.
 *
 * @param {string} employeeId UUID
 * @param {number} year
 * @param {number} month 1-12
 * @returns {Promise<{
 *   payType: 'monthly'|'daily',
 *   baseSalary: number|null,
 *   dailyRate: number|null,
 *   workDaysInMonth: number,
 *   workHoursPerDay: number,
 *   dailyRateCalculated: number,
 *   hourlyRate: number
 * }>}
 */
export async function calculateHourlyRate(employeeId, year, month) {
  const supabase = supabaseServer;

  const [settings, workHoursPerDay, { workDays }] = await Promise.all([
    getPayrollSettings(supabase, employeeId),
    getShiftHoursPerDay(supabase, employeeId, year, month),
    countWorkDaysInMonth(employeeId, year, month),
  ]);

  if (!settings) {
    throw new Error(`No payroll settings found for employee ${employeeId}`);
  }

  const effectiveWorkHours = workHoursPerDay || DEFAULT_WORK_HOURS;
  let dailyRateCalculated;
  let hourlyRate;

  if (settings.pay_type === 'monthly') {
    if (!settings.base_salary || settings.base_salary <= 0) {
      throw new Error(`Employee ${employeeId} has no base_salary set`);
    }
    const effectiveWorkDays = workDays > 0 ? workDays : 26; // fallback
    dailyRateCalculated = settings.base_salary / effectiveWorkDays;
    hourlyRate = dailyRateCalculated / effectiveWorkHours;
  } else {
    // daily employee
    if (!settings.daily_rate || settings.daily_rate <= 0) {
      throw new Error(`Employee ${employeeId} has no daily_rate set`);
    }
    dailyRateCalculated = settings.daily_rate;
    hourlyRate = settings.daily_rate / effectiveWorkHours;
  }

  return {
    payType: settings.pay_type,
    baseSalary: settings.base_salary ?? null,
    dailyRate: settings.daily_rate ?? null,
    workDaysInMonth: workDays,
    workHoursPerDay: effectiveWorkHours,
    dailyRateCalculated: Math.round(dailyRateCalculated * 100) / 100,
    hourlyRate: Math.round(hourlyRate * 100) / 100,
  };
}

/**
 * Batch calculate hourly rates for multiple employees at once.
 *
 * @param {string[]} employeeIds
 * @param {number} year
 * @param {number} month
 * @returns {Promise<Record<string, object>>} Map of employeeId → rate info
 */
export async function batchCalculateHourlyRates(employeeIds, year, month) {
  const results = {};
  await Promise.all(
    employeeIds.map(async (empId) => {
      try {
        results[empId] = await calculateHourlyRate(empId, year, month);
      } catch (err) {
        results[empId] = { error: err.message };
      }
    })
  );
  return results;
}

/**
 * Calculate the per-day absence deduction for an employee.
 *
 * @param {string} employeeId
 * @param {number} year
 * @param {number} month
 * @param {number} absentDays  (can be fractional for partial day)
 */
export async function calculateAbsenceDeduction(employeeId, year, month, absentDays) {
  const rates = await calculateHourlyRate(employeeId, year, month);
  return {
    ...rates,
    absentDays,
    deduction: Math.round(rates.dailyRateCalculated * absentDays),
  };
}
