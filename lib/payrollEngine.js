/**
 * payrollEngine.js
 * --------------------------------------------------
 * Full payroll calculation engine for TDOne ERP.
 *
 * Two run types:
 *  1. SALARY RUN
 *     - Period: calendar month
 *     - Inputs: base_salary or daily_rate, work days, absent days
 *     - Deductions: income tax (Lao PIT progressive), social security (SSI)
 *                   employee-level deductions
 *     - Pay date: 15th–20th of the following month
 *
 *  2. OT/INCENTIVE RUN (extra pay run)
 *     - Period: calendar month
 *     - Inputs: approved extra_pay_records (OT, piece work, holiday work)
 *               + incentive_records
 *     - Deductions: employee-level deductions flagged for 'ot_incentive'
 *     - NO income tax on OT run (per Thailand/LAO standard for piece work)
 *     - Pay date: last day of the following month
 */

import { supabaseServer } from '@/lib/supabaseServer';
import { calculateHourlyRate } from '@/lib/hourlyRateService';
import { countWorkDaysInMonth } from '@/lib/shiftService';
import { getExtraPaySummaryForEmployee } from '@/lib/extraPayEngine';

const SSI_EMPLOYEE_RATE = 0.055;  // 5.5% Lao SSI (employee share, adjust if needed)
const SSI_EMPLOYER_RATE = 0.065;  // 6.5% Lao SSI (employer share)
const SSI_WAGE_CEILING = 4_500_000; // LAK — SSI ceiling per month

// ─────────────────────────────────────────────────────────────────────────────
// Tax calculation using configurable brackets
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch tax brackets from DB (cached per request via module-level singleton).
 * In production, consider adding Redis/memory cache with TTL.
 */
let _bracketCache = null;
let _bracketCacheAt = 0;

async function fetchTaxBrackets(supabase) {
  const now = Date.now();
  if (_bracketCache && now - _bracketCacheAt < 60_000) return _bracketCache;

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('tax_brackets')
    .select('min_amount, max_amount, rate_percent')
    .eq('country_code', 'LA')
    .eq('is_active', true)
    .lte('effective_from', today)
    .or(`effective_to.is.null,effective_to.gte.${today}`)
    .order('min_amount');

  if (error) throw new Error(`fetchTaxBrackets: ${error.message}`);
  _bracketCache = data;
  _bracketCacheAt = now;
  return data;
}

/**
 * Calculate income tax using progressive brackets.
 *
 * @param {number} grossIncome  LAK per month
 * @param {Array} brackets
 * @returns {{ tax: number, effectiveRate: number, breakdown: Array }}
 */
export function calculateProgressiveTax(grossIncome, brackets) {
  let tax = 0;
  const breakdown = [];

  for (const bracket of brackets) {
    const min = bracket.min_amount;
    const max = bracket.max_amount ?? Infinity;
    const rate = bracket.rate_percent / 100;

    if (grossIncome <= min) break;

    const taxableInBracket = Math.min(grossIncome, max + 1) - min;
    if (taxableInBracket <= 0) continue;

    const taxInBracket = Math.round(taxableInBracket * rate);
    tax += taxInBracket;
    breakdown.push({
      min,
      max: bracket.max_amount,
      rate: bracket.rate_percent,
      taxableAmount: taxableInBracket,
      taxAmount: taxInBracket,
    });
  }

  return {
    tax: Math.round(tax),
    effectiveRate: grossIncome > 0 ? Math.round((tax / grossIncome) * 10000) / 100 : 0,
    breakdown,
  };
}

/**
 * Calculate social security contribution.
 *
 * @param {number} grossIncome
 * @param {boolean} enrolled
 * @returns {{ employee: number, employer: number, base: number }}
 */
export function calculateSocialSecurity(grossIncome, enrolled = true) {
  if (!enrolled) return { employee: 0, employer: 0, base: 0 };
  const base = Math.min(grossIncome, SSI_WAGE_CEILING);
  return {
    employee: Math.round(base * SSI_EMPLOYEE_RATE),
    employer: Math.round(base * SSI_EMPLOYER_RATE),
    base,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Attendance / absence lookup
// ─────────────────────────────────────────────────────────────────────────────

async function getAttendanceSummary(supabase, employeeId, periodMonth) {
  const [year, month] = periodMonth.split('-').map(Number);
  const from = `${periodMonth}-01`;
  const to = new Date(year, month, 0).toISOString().slice(0, 10);

  // Try monthly_daywork_summary first (pre-computed)
  const { data: monthly } = await supabase
    .from('monthly_daywork_summary')
    .select('work_days, absent_days, total_hours')
    .eq('employee_id', employeeId)
    .eq('month', periodMonth)
    .maybeSingle();

  if (monthly) {
    return {
      workDays: monthly.work_days ?? 0,
      absentDays: monthly.absent_days ?? 0,
      totalHours: monthly.total_hours ?? 0,
    };
  }

  // Fallback: count from attendance table directly
  const { data: rows, error } = await supabase
    .from('attendance')
    .select('work_date, status')
    .eq('employee_id', employeeId)
    .gte('work_date', from)
    .lte('work_date', to);

  if (error) throw new Error(`getAttendanceSummary: ${error.message}`);

  const workDays = (rows ?? []).filter((r) => r.status === 'present').length;
  const absentDays = (rows ?? []).filter((r) => r.status === 'absent').length;
  return { workDays, absentDays, totalHours: 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Deductions
// ─────────────────────────────────────────────────────────────────────────────

async function getEmployeeDeductions(supabase, employeeId, periodMonth, runType) {
  const { data, error } = await supabase
    .from('employee_deductions')
    .select(`
      id, custom_name, amount, remaining_amount,
      deduction_template:deduction_templates(name, deduction_type, default_amount, applies_to_run_type)
    `)
    .eq('employee_id', employeeId)
    .eq('is_active', true)
    .lte('start_month', periodMonth)
    .or(`end_month.is.null,end_month.gte.${periodMonth}`);

  if (error) throw new Error(`getEmployeeDeductions: ${error.message}`);

  return (data ?? []).filter((d) => {
    const appliesto = d.deduction_template?.applies_to_run_type ?? 'salary';
    return appliesto === runType || appliesto === 'both';
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Salary run calculator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate salary payroll item for a single employee.
 *
 * @param {string} employeeId
 * @param {string} periodMonth  "YYYY-MM"
 * @returns {Promise<SalaryLineItem>}
 */
export async function calculateSalaryItem(employeeId, periodMonth) {
  const supabase = supabaseServer;
  const [year, month] = periodMonth.split('-').map(Number);

  const [rateInfo, attendance, deductionRows, brackets, paySettings] = await Promise.all([
    calculateHourlyRate(employeeId, year, month),
    getAttendanceSummary(supabase, employeeId, periodMonth),
    getEmployeeDeductions(supabase, employeeId, periodMonth, 'salary'),
    fetchTaxBrackets(supabase),
    supabase
      .from('employee_payroll_settings')
      .select('social_security_enrolled, pay_type, base_salary, daily_rate')
      .eq('employee_id', employeeId)
      .maybeSingle()
      .then((r) => r.data),
  ]);

  // Base amount calculation
  let baseAmount;
  const { workDays: expectedWorkDays } = await countWorkDaysInMonth(employeeId, year, month);

  if (rateInfo.payType === 'monthly') {
    // Pro-rate: base_salary × (actualWorkDays / expectedWorkDays)
    const effectiveExpected = expectedWorkDays > 0 ? expectedWorkDays : 26;
    const actualWork = attendance.workDays;
    baseAmount = Math.round(rateInfo.baseSalary * (actualWork / effectiveExpected));
  } else {
    // Daily: daily_rate × workDays
    baseAmount = Math.round(rateInfo.dailyRateCalculated * attendance.workDays);
  }

  // Absence deduction (for monthly employees who did not show up)
  const absentDeduction =
    rateInfo.payType === 'monthly'
      ? Math.round(rateInfo.dailyRateCalculated * attendance.absentDays)
      : 0;

  const grossPay = Math.max(0, baseAmount - absentDeduction);

  // Tax
  const { tax: incomeTax, effectiveRate, breakdown: taxBreakdown } = calculateProgressiveTax(
    grossPay,
    brackets
  );

  // SSI
  const ssi = calculateSocialSecurity(grossPay, paySettings?.social_security_enrolled ?? true);

  // Other deductions
  const otherDeductions = [];
  let totalOtherDeductions = 0;
  for (const d of deductionRows) {
    const name = d.custom_name ?? d.deduction_template?.name ?? 'หักอื่น ๆ';
    const amount = d.amount ?? d.deduction_template?.default_amount ?? 0;
    otherDeductions.push({ name, amount, deductionId: d.id });
    totalOtherDeductions += amount;
  }

  const totalDeductions = incomeTax + ssi.employee + totalOtherDeductions;
  const netPay = Math.max(0, grossPay - totalDeductions);

  const warnings = [];
  if (netPay <= 0 && grossPay > 0) warnings.push('net_pay_zero_after_deductions');
  if (attendance.absentDays > expectedWorkDays * 0.5) warnings.push('high_absence');

  return {
    employeeId,
    periodMonth,
    payType: rateInfo.payType,
    baseAmount,
    workDays: attendance.workDays,
    workHours: attendance.totalHours,
    absentDays: attendance.absentDays,
    absentDeduction,
    grossPay,
    socialSecurityEmployee: ssi.employee,
    socialSecurityEmployer: ssi.employer,
    incomeTax,
    taxEffectiveRate: effectiveRate,
    taxBreakdown,
    deductions: otherDeductions,
    totalDeductions,
    netPay,
    employerCost: grossPay + ssi.employer,
    currency: 'LAK',
    warnings,
    rateInfo,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// OT / incentive run calculator
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Calculate OT/incentive run item for a single employee.
 *
 * @param {string} employeeId
 * @param {string} periodMonth "YYYY-MM"
 * @param {string|null} payrollRunId  for incentive_records lookup
 * @returns {Promise<OTLineItem>}
 */
export async function calculateOTItem(employeeId, periodMonth, payrollRunId = null) {
  const supabase = supabaseServer;

  const [extraPaySummary, incentiveRows, deductionRows] = await Promise.all([
    getExtraPaySummaryForEmployee(employeeId, periodMonth),
    supabase
      .from('incentive_records')
      .select('incentive_type, amount')
      .eq('employee_id', employeeId)
      .eq('period_month', periodMonth)
      .then((r) => r.data ?? []),
    getEmployeeDeductions(supabase, employeeId, periodMonth, 'ot_incentive'),
  ]);

  const extraPayTotal = extraPaySummary.totalAmount;
  const incentiveTotal = incentiveRows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const grossPay = extraPayTotal + incentiveTotal;

  // OT run: no income tax
  const otherDeductions = [];
  let totalOtherDeductions = 0;
  for (const d of deductionRows) {
    const name = d.custom_name ?? d.deduction_template?.name ?? 'หักอื่น ๆ';
    const amount = d.amount ?? d.deduction_template?.default_amount ?? 0;
    otherDeductions.push({ name, amount, deductionId: d.id });
    totalOtherDeductions += amount;
  }

  const netPay = Math.max(0, grossPay - totalOtherDeductions);

  const warnings = [];
  const totalOTHours = Object.values(extraPaySummary.byType).reduce(
    (s, v) => s + (v.hours ?? 0),
    0
  );
  if (totalOTHours > 45) warnings.push('ot_hours_over_45h');

  return {
    employeeId,
    periodMonth,
    extraPaySummary: extraPaySummary.byType,
    extraPayTotal,
    incentiveTotal,
    incentiveRecords: incentiveRows,
    grossPay,
    deductions: otherDeductions,
    totalDeductions: totalOtherDeductions,
    netPay,
    currency: 'LAK',
    warnings,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Payroll run management
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all employees eligible for a payroll run.
 * Can filter by work_site_id.
 */
async function getEligibleEmployees(supabase, workSiteId = null) {
  let q = supabase
    .from('employee_payroll_settings')
    .select('employee_id, emp_code, pay_type, work_site_id')
    .eq('is_active', true);

  if (workSiteId) q = q.eq('work_site_id', workSiteId);

  const { data, error } = await q;
  if (error) throw new Error(`getEligibleEmployees: ${error.message}`);
  return data ?? [];
}

/**
 * Execute salary payroll run calculation and save payroll_items.
 *
 * @param {string} payrollRunId UUID of an existing payroll_runs record (status: 'draft')
 * @param {string} createdBy
 */
export async function executeSalaryRun(payrollRunId, createdBy) {
  const supabase = supabaseServer;

  // Load run metadata
  const { data: run, error: runErr } = await supabase
    .from('payroll_runs')
    .select('*')
    .eq('id', payrollRunId)
    .single();

  if (runErr || !run) throw new Error(`executeSalaryRun: run not found`);
  if (run.run_type !== 'salary') throw new Error('executeSalaryRun: run_type must be salary');
  if (!['draft', 'review'].includes(run.status)) {
    throw new Error(`executeSalaryRun: cannot recalculate run in status '${run.status}'`);
  }

  // Set status to calculating
  await supabase.from('payroll_runs').update({ status: 'calculating', updated_at: new Date().toISOString() }).eq('id', payrollRunId);

  const employees = await getEligibleEmployees(supabase, run.work_site_id ?? null);
  const results = [];
  let totalGross = 0, totalDeductions = 0, totalNet = 0, totalEmployerCost = 0;

  for (const emp of employees) {
    try {
      const item = await calculateSalaryItem(emp.employee_id, run.period_month);
      results.push({
        payroll_run_id: payrollRunId,
        employee_id: emp.employee_id,
        emp_code: emp.emp_code,
        pay_type: item.payType,
        base_amount: item.baseAmount,
        work_days: item.workDays,
        work_hours: item.workHours,
        absent_days: item.absentDays,
        absent_deduction: item.absentDeduction,
        gross_pay: item.grossPay,
        social_security_employee: item.socialSecurityEmployee,
        social_security_employer: item.socialSecurityEmployer,
        income_tax: item.incomeTax,
        deductions: item.deductions,
        total_deductions: item.totalDeductions,
        net_pay: item.netPay,
        warnings: item.warnings,
        status: 'calculated',
        updated_at: new Date().toISOString(),
      });
      totalGross += item.grossPay;
      totalDeductions += item.totalDeductions;
      totalNet += item.netPay;
      totalEmployerCost += item.employerCost;
    } catch (err) {
      results.push({
        payroll_run_id: payrollRunId,
        employee_id: emp.employee_id,
        emp_code: emp.emp_code,
        pay_type: emp.pay_type,
        gross_pay: 0,
        net_pay: 0,
        total_deductions: 0,
        warnings: [`calculation_error: ${err.message}`],
        status: 'calculated',
        updated_at: new Date().toISOString(),
      });
    }
  }

  // Upsert all items
  const { error: upsertErr } = await supabase
    .from('payroll_items')
    .upsert(results, { onConflict: 'payroll_run_id,employee_id' });

  if (upsertErr) throw new Error(`executeSalaryRun upsert: ${upsertErr.message}`);

  // Update run totals
  await supabase.from('payroll_runs').update({
    status: 'review',
    employee_count: employees.length,
    total_gross: totalGross,
    total_deductions: totalDeductions,
    total_net: totalNet,
    total_employer_cost: totalEmployerCost,
    updated_at: new Date().toISOString(),
  }).eq('id', payrollRunId);

  return { payrollRunId, employeeCount: employees.length, totalGross, totalNet };
}

/**
 * Execute OT/incentive run calculation.
 *
 * @param {string} payrollRunId
 * @param {string} createdBy
 */
export async function executeOTRun(payrollRunId, createdBy) {
  const supabase = supabaseServer;

  const { data: run, error: runErr } = await supabase
    .from('payroll_runs')
    .select('*')
    .eq('id', payrollRunId)
    .single();

  if (runErr || !run) throw new Error(`executeOTRun: run not found`);
  if (run.run_type !== 'ot_incentive') throw new Error('executeOTRun: run_type must be ot_incentive');
  if (!['draft', 'review'].includes(run.status)) {
    throw new Error(`executeOTRun: cannot recalculate in status '${run.status}'`);
  }

  await supabase.from('payroll_runs').update({ status: 'calculating', updated_at: new Date().toISOString() }).eq('id', payrollRunId);

  const employees = await getEligibleEmployees(supabase, run.work_site_id ?? null);
  const results = [];
  let totalGross = 0, totalDeductions = 0, totalNet = 0;

  for (const emp of employees) {
    try {
      const item = await calculateOTItem(emp.employee_id, run.period_month, payrollRunId);

      // Skip employees with zero extra pay
      if (item.grossPay === 0) continue;

      results.push({
        payroll_run_id: payrollRunId,
        employee_id: emp.employee_id,
        emp_code: emp.emp_code,
        pay_type: emp.pay_type,
        extra_pay_summary: item.extraPaySummary,
        incentive_total: item.incentiveTotal,
        gross_pay: item.grossPay,
        deductions: item.deductions,
        total_deductions: item.totalDeductions,
        net_pay: item.netPay,
        warnings: item.warnings,
        status: 'calculated',
        updated_at: new Date().toISOString(),
      });
      totalGross += item.grossPay;
      totalDeductions += item.totalDeductions;
      totalNet += item.netPay;
    } catch (err) {
      // Log error but include employee with zero
      results.push({
        payroll_run_id: payrollRunId,
        employee_id: emp.employee_id,
        emp_code: emp.emp_code,
        pay_type: emp.pay_type,
        gross_pay: 0,
        net_pay: 0,
        total_deductions: 0,
        warnings: [`calculation_error: ${err.message}`],
        status: 'calculated',
        updated_at: new Date().toISOString(),
      });
    }
  }

  if (results.length > 0) {
    const { error: upsertErr } = await supabase
      .from('payroll_items')
      .upsert(results, { onConflict: 'payroll_run_id,employee_id' });

    if (upsertErr) throw new Error(`executeOTRun upsert: ${upsertErr.message}`);
  }

  await supabase.from('payroll_runs').update({
    status: 'review',
    employee_count: results.length,
    total_gross: totalGross,
    total_deductions: totalDeductions,
    total_net: totalNet,
    total_employer_cost: totalGross,
    updated_at: new Date().toISOString(),
  }).eq('id', payrollRunId);

  return { payrollRunId, employeeCount: results.length, totalGross, totalNet };
}
