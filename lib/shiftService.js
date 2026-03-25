/**
 * shiftService.js
 * --------------------------------------------------
 * Rotation shift schedule calculator for TDOne ERP.
 */

import prisma from "@/lib/prisma";

export function getDayInCycle(targetDate, cycleStartDate, workDays, restDays) {
  const target = new Date(targetDate);
  const start = new Date(cycleStartDate);

  const targetNorm = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
  const startNorm = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());

  const diffMs = targetNorm - startNorm;
  const diffDays = Math.round(diffMs / 86_400_000);

  if (diffDays < 0) return { isWorkDay: false, cycleDay: null, blockDay: null };

  const cycleTotal = workDays + restDays;
  const cycleDay = diffDays % cycleTotal;
  const isWorkDay = cycleDay < workDays;
  const blockDay = isWorkDay ? cycleDay + 1 : cycleDay - workDays + 1;

  return { isWorkDay, cycleDay, blockDay };
}

async function getActiveShiftAssignment(employeeId, asOf = null) {
  const targetDate = asOf ?? new Date().toISOString().slice(0, 10);

  return prisma.shiftAssignment.findFirst({
    where: {
      employee_id: employeeId,
      effective_from: { lte: targetDate },
      OR: [{ effective_to: null }, { effective_to: { gte: targetDate } }],
    },
    orderBy: { effective_from: "desc" },
    include: {
      shift_pattern: {
        select: {
          id: true,
          pattern_name: true,
          work_days: true,
          rest_days: true,
          cycle_total_days: true,
          work_hours_per_day: true,
        },
      },
      shift_type: {
        select: {
          id: true,
          type_name: true,
          start_time: true,
          end_time: true,
          crosses_midnight: true,
          break_minutes: true,
          is_night_shift: true,
          grace_minutes: true,
        },
      },
    },
  });
}

export async function getEmployeeMonthSchedule(employeeId, year, month) {
  const firstDay = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0);
  const lastDayStr = lastDay.toISOString().slice(0, 10);

  const assignment = await getActiveShiftAssignment(employeeId, firstDay);
  if (!assignment) return [];

  const { shift_pattern: pattern, shift_type: shiftType, cycle_start_date } = assignment;
  const days = lastDay.getDate();
  const schedule = [];

  for (let d = 1; d <= days; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
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

export async function countWorkDaysInMonth(employeeId, year, month) {
  const schedule = await getEmployeeMonthSchedule(employeeId, year, month);
  const workDays = schedule.filter((d) => d.isWorkDay).length;
  return { workDays, restDays: schedule.length - workDays, totalDays: schedule.length };
}

export async function isEmployeeWorkDay(employeeId, dateStr) {
  const assignment = await getActiveShiftAssignment(employeeId, dateStr);
  if (!assignment) return { isWorkDay: false, shiftType: null };

  const { shift_pattern: pattern, shift_type: shiftType, cycle_start_date } = assignment;
  const { isWorkDay } = getDayInCycle(dateStr, cycle_start_date, pattern.work_days, pattern.rest_days);
  return { isWorkDay, shiftType: isWorkDay ? shiftType : null };
}

export async function getRosterByDate(dateStr) {
  const assignments = await prisma.shiftAssignment.findMany({
    where: {
      effective_from: { lte: dateStr },
      OR: [{ effective_to: null }, { effective_to: { gte: dateStr } }],
    },
    include: {
      shift_pattern: {
        select: { work_days: true, rest_days: true, pattern_name: true, work_hours_per_day: true },
      },
      shift_type: {
        select: { type_name: true, start_time: true, end_time: true, is_night_shift: true },
      },
    },
  });

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
