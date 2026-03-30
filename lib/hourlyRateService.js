/**
 * hourlyRateService.js
 * --------------------------------------------------
 * Calculates effective hourly and daily rates for payroll and extra-pay.
 */

import { getPrisma } from "@/lib/prisma";
import { countWorkDaysInMonth } from "@/lib/shiftService";

const DEFAULT_WORK_HOURS = 8;

async function getPayrollSettings(employeeId) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  return prisma.payrollSettings.findUnique({
    where: { employee_id: employeeId },
  });
}

async function getShiftHoursPerDay(employeeId, year, month) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;

  const assignment = await prisma.shiftAssignment.findFirst({
    where: {
      employee_id: employeeId,
      effective_from: { lte: firstDay },
      OR: [{ effective_to: null }, { effective_to: { gte: firstDay } }],
    },
    orderBy: { effective_from: "desc" },
    include: {
      shift_pattern: { select: { work_hours_per_day: true } },
    },
  });

  return assignment?.shift_pattern?.work_hours_per_day ?? DEFAULT_WORK_HOURS;
}

export async function calculateHourlyRate(employeeId, year, month) {
  const [settings, workHoursPerDay, { workDays }] = await Promise.all([
    getPayrollSettings(employeeId),
    getShiftHoursPerDay(employeeId, year, month),
    countWorkDaysInMonth(employeeId, year, month),
  ]);

  if (!settings) {
    throw new Error(`No payroll settings found for employee ${employeeId}`);
  }

  const effectiveWorkHours = workHoursPerDay || DEFAULT_WORK_HOURS;
  let dailyRateCalculated;
  let hourlyRate;

  if (settings.pay_type === "monthly") {
    if (!settings.base_salary || settings.base_salary <= 0) {
      throw new Error(`Employee ${employeeId} has no base_salary set`);
    }
    const effectiveWorkDays = workDays > 0 ? workDays : 26;
    dailyRateCalculated = settings.base_salary / effectiveWorkDays;
    hourlyRate = dailyRateCalculated / effectiveWorkHours;
  } else {
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

export async function calculateAbsenceDeduction(employeeId, year, month, absentDays) {
  const rates = await calculateHourlyRate(employeeId, year, month);
  return {
    ...rates,
    absentDays,
    deduction: Math.round(rates.dailyRateCalculated * absentDays),
  };
}
