/**
 * payrollEngine.js
 * --------------------------------------------------
 * Full payroll calculation engine for TDOne ERP.
 */

import prisma from "@/lib/prisma";
import { calculateHourlyRate } from "@/lib/hourlyRateService";
import { countWorkDaysInMonth } from "@/lib/shiftService";
import { getExtraPaySummaryForEmployee } from "@/lib/extraPayEngine";

const SSI_EMPLOYEE_RATE = 0.055;
const SSI_EMPLOYER_RATE = 0.065;
const SSI_WAGE_CEILING = 4_500_000;

// ─── Tax ─────────────────────────────────────────────────────────────────────

let _bracketCache = null;
let _bracketCacheAt = 0;

async function fetchTaxBrackets() {
  const now = Date.now();
  if (_bracketCache && now - _bracketCacheAt < 60_000) return _bracketCache;

  const today = new Date().toISOString().slice(0, 10);
  const data = await prisma.taxBracket.findMany({
    where: {
      country_code: "LA",
      is_active: true,
      effective_from: { lte: today },
      OR: [{ effective_to: null }, { effective_to: { gte: today } }],
    },
    orderBy: { min_amount: "asc" },
  });

  _bracketCache = data;
  _bracketCacheAt = now;
  return data;
}

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

export function calculateSocialSecurity(grossIncome, enrolled = true) {
  if (!enrolled) return { employee: 0, employer: 0, base: 0 };
  const base = Math.min(grossIncome, SSI_WAGE_CEILING);
  return {
    employee: Math.round(base * SSI_EMPLOYEE_RATE),
    employer: Math.round(base * SSI_EMPLOYER_RATE),
    base,
  };
}

// ─── Attendance ───────────────────────────────────────────────────────────────

async function getAttendanceSummary(employeeId, periodMonth) {
  const [year, month] = periodMonth.split("-").map(Number);
  const from = `${periodMonth}-01`;
  const to = new Date(year, month, 0).toISOString().slice(0, 10);

  const monthly = await prisma.monthlyDayworkSummary.findUnique({
    where: { employee_id_month: { employee_id: employeeId, month: periodMonth } },
  });

  if (monthly) {
    return {
      workDays: monthly.work_days ?? 0,
      absentDays: monthly.absent_days ?? 0,
      totalHours: monthly.total_hours ?? 0,
    };
  }

  const rows = await prisma.attendance.findMany({
    where: { employee_id: employeeId, work_date: { gte: from, lte: to } },
  });

  const workDays = rows.filter((r) => r.status === "present").length;
  const absentDays = rows.filter((r) => r.status === "absent").length;
  return { workDays, absentDays, totalHours: 0 };
}

// ─── Deductions ───────────────────────────────────────────────────────────────

async function getEmployeeDeductions(employeeId, periodMonth, runType) {
  const data = await prisma.employeeDeduction.findMany({
    where: {
      employee_id: employeeId,
      is_active: true,
      start_month: { lte: periodMonth },
      OR: [{ end_month: null }, { end_month: { gte: periodMonth } }],
    },
    include: {
      deduction_template: {
        select: { name: true, deduction_type: true, default_amount: true, applies_to_run_type: true },
      },
    },
  });

  return data.filter((d) => {
    const appliesto = d.deduction_template?.applies_to_run_type ?? "salary";
    return appliesto === runType || appliesto === "both";
  });
}

// ─── Salary Run ───────────────────────────────────────────────────────────────

export async function calculateSalaryItem(employeeId, periodMonth) {
  const [year, month] = periodMonth.split("-").map(Number);

  const [rateInfo, attendance, deductionRows, brackets, paySettings] = await Promise.all([
    calculateHourlyRate(employeeId, year, month),
    getAttendanceSummary(employeeId, periodMonth),
    getEmployeeDeductions(employeeId, periodMonth, "salary"),
    fetchTaxBrackets(),
    prisma.payrollSettings.findUnique({
      where: { employee_id: employeeId },
      select: { social_security_enrolled: true, pay_type: true, base_salary: true, daily_rate: true },
    }),
  ]);

  let baseAmount;
  const { workDays: expectedWorkDays } = await countWorkDaysInMonth(employeeId, year, month);

  if (rateInfo.payType === "monthly") {
    const effectiveExpected = expectedWorkDays > 0 ? expectedWorkDays : 26;
    const actualWork = attendance.workDays;
    baseAmount = Math.round(rateInfo.baseSalary * (actualWork / effectiveExpected));
  } else {
    baseAmount = Math.round(rateInfo.dailyRateCalculated * attendance.workDays);
  }

  const absentDeduction =
    rateInfo.payType === "monthly"
      ? Math.round(rateInfo.dailyRateCalculated * attendance.absentDays)
      : 0;

  const grossPay = Math.max(0, baseAmount - absentDeduction);

  const { tax: incomeTax, effectiveRate, breakdown: taxBreakdown } = calculateProgressiveTax(
    grossPay,
    brackets
  );

  const ssi = calculateSocialSecurity(grossPay, paySettings?.social_security_enrolled ?? true);

  const otherDeductions = [];
  let totalOtherDeductions = 0;
  for (const d of deductionRows) {
    const name = d.custom_name ?? d.deduction_template?.name ?? "หักอื่น ๆ";
    const amount = d.amount ?? d.deduction_template?.default_amount ?? 0;
    otherDeductions.push({ name, amount, deductionId: d.id });
    totalOtherDeductions += amount;
  }

  const totalDeductions = incomeTax + ssi.employee + totalOtherDeductions;
  const netPay = Math.max(0, grossPay - totalDeductions);

  const warnings = [];
  if (netPay <= 0 && grossPay > 0) warnings.push("net_pay_zero_after_deductions");
  if (attendance.absentDays > expectedWorkDays * 0.5) warnings.push("high_absence");

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
    currency: "LAK",
    warnings,
    rateInfo,
  };
}

// ─── OT Run ───────────────────────────────────────────────────────────────────

export async function calculateOTItem(employeeId, periodMonth, payrollRunId = null) {
  const [extraPaySummary, incentiveRows, deductionRows] = await Promise.all([
    getExtraPaySummaryForEmployee(employeeId, periodMonth),
    prisma.incentiveRecord.findMany({
      where: { employee_id: employeeId, period_month: periodMonth },
      select: { incentive_type: true, amount: true },
    }),
    getEmployeeDeductions(employeeId, periodMonth, "ot_incentive"),
  ]);

  const extraPayTotal = extraPaySummary.totalAmount;
  const incentiveTotal = incentiveRows.reduce((s, r) => s + (r.amount ?? 0), 0);
  const grossPay = extraPayTotal + incentiveTotal;

  const otherDeductions = [];
  let totalOtherDeductions = 0;
  for (const d of deductionRows) {
    const name = d.custom_name ?? d.deduction_template?.name ?? "หักอื่น ๆ";
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
  if (totalOTHours > 45) warnings.push("ot_hours_over_45h");

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
    currency: "LAK",
    warnings,
  };
}

// ─── Run Management ───────────────────────────────────────────────────────────

async function getEligibleEmployees(workSiteId = null) {
  return prisma.employeePayrollSettings.findMany({
    where: {
      is_active: true,
      ...(workSiteId ? { work_site_id: workSiteId } : {}),
    },
    select: { employee_id: true, emp_code: true, pay_type: true, work_site_id: true },
  });
}

export async function executeSalaryRun(payrollRunId, createdBy) {
  const run = await prisma.payrollRun.findUnique({ where: { id: payrollRunId } });

  if (!run) throw new Error("executeSalaryRun: run not found");
  if (run.run_type !== "salary") throw new Error("executeSalaryRun: run_type must be salary");
  if (!["draft", "review"].includes(run.status)) {
    throw new Error(`executeSalaryRun: cannot recalculate run in status '${run.status}'`);
  }

  await prisma.payrollRun.update({
    where: { id: payrollRunId },
    data: { status: "calculating" },
  });

  const employees = await getEligibleEmployees(run.work_site_id ?? null);
  let totalGross = 0, totalDeductions = 0, totalNet = 0, totalEmployerCost = 0;

  for (const emp of employees) {
    try {
      const item = await calculateSalaryItem(emp.employee_id, run.period_month);

      await prisma.payrollItem.upsert({
        where: { payroll_run_id_employee_id: { payroll_run_id: payrollRunId, employee_id: emp.employee_id } },
        update: {
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
          status: "calculated",
        },
        create: {
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
          status: "calculated",
        },
      });

      totalGross += item.grossPay;
      totalDeductions += item.totalDeductions;
      totalNet += item.netPay;
      totalEmployerCost += item.employerCost;
    } catch (err) {
      await prisma.payrollItem.upsert({
        where: { payroll_run_id_employee_id: { payroll_run_id: payrollRunId, employee_id: emp.employee_id } },
        update: {
          gross_pay: 0, net_pay: 0, total_deductions: 0,
          warnings: [`calculation_error: ${err.message}`], status: "calculated",
        },
        create: {
          payroll_run_id: payrollRunId,
          employee_id: emp.employee_id,
          emp_code: emp.emp_code,
          pay_type: emp.pay_type,
          gross_pay: 0, net_pay: 0, total_deductions: 0,
          warnings: [`calculation_error: ${err.message}`], status: "calculated",
        },
      });
    }
  }

  await prisma.payrollRun.update({
    where: { id: payrollRunId },
    data: {
      status: "review",
      employee_count: employees.length,
      total_gross: totalGross,
      total_deductions: totalDeductions,
      total_net: totalNet,
      total_employer_cost: totalEmployerCost,
    },
  });

  return { payrollRunId, employeeCount: employees.length, totalGross, totalNet };
}

export async function executeOTRun(payrollRunId, createdBy) {
  const run = await prisma.payrollRun.findUnique({ where: { id: payrollRunId } });

  if (!run) throw new Error("executeOTRun: run not found");
  if (run.run_type !== "ot_incentive") throw new Error("executeOTRun: run_type must be ot_incentive");
  if (!["draft", "review"].includes(run.status)) {
    throw new Error(`executeOTRun: cannot recalculate in status '${run.status}'`);
  }

  await prisma.payrollRun.update({
    where: { id: payrollRunId },
    data: { status: "calculating" },
  });

  const employees = await getEligibleEmployees(run.work_site_id ?? null);
  let totalGross = 0, totalDeductions = 0, totalNet = 0;

  for (const emp of employees) {
    try {
      const item = await calculateOTItem(emp.employee_id, run.period_month, payrollRunId);

      if (item.grossPay === 0) continue;

      await prisma.payrollItem.upsert({
        where: { payroll_run_id_employee_id: { payroll_run_id: payrollRunId, employee_id: emp.employee_id } },
        update: {
          emp_code: emp.emp_code,
          pay_type: emp.pay_type,
          extra_pay_summary: item.extraPaySummary,
          incentive_total: item.incentiveTotal,
          gross_pay: item.grossPay,
          deductions: item.deductions,
          total_deductions: item.totalDeductions,
          net_pay: item.netPay,
          warnings: item.warnings,
          status: "calculated",
        },
        create: {
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
          status: "calculated",
        },
      });

      totalGross += item.grossPay;
      totalDeductions += item.totalDeductions;
      totalNet += item.netPay;
    } catch (err) {
      await prisma.payrollItem.upsert({
        where: { payroll_run_id_employee_id: { payroll_run_id: payrollRunId, employee_id: emp.employee_id } },
        update: {
          gross_pay: 0, net_pay: 0, total_deductions: 0,
          warnings: [`calculation_error: ${err.message}`], status: "calculated",
        },
        create: {
          payroll_run_id: payrollRunId,
          employee_id: emp.employee_id,
          emp_code: emp.emp_code,
          pay_type: emp.pay_type,
          gross_pay: 0, net_pay: 0, total_deductions: 0,
          warnings: [`calculation_error: ${err.message}`], status: "calculated",
        },
      });
    }
  }

  await prisma.payrollRun.update({
    where: { id: payrollRunId },
    data: {
      status: "review",
      employee_count: employees.length,
      total_gross: totalGross,
      total_deductions: totalDeductions,
      total_net: totalNet,
      total_employer_cost: totalGross,
    },
  });

  return { payrollRunId, employeeCount: employees.length, totalGross, totalNet };
}
