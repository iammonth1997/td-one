/**
 * extraPayEngine.js
 * --------------------------------------------------
 * Core calculation engine for extra pay (OT, PieceWork, Holiday pay).
 */

import { getPrisma } from "@/lib/prisma";
import { calculateHourlyRate } from "@/lib/hourlyRateService";
import { isEmployeeWorkDay } from "@/lib/shiftService";

const DAY_START_MINUTES = 6 * 60;
const DAY_END_MINUTES   = 22 * 60;

export function timeToMinutes(timeStr) {
  const [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}

export function minutesToTime(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export function splitDayNight(startMin, endMin) {
  let dayMinutes = 0;
  let nightMinutes = 0;

  const segments = buildDaySegments(startMin, endMin);
  for (const { from, to } of segments) {
    const normFrom = ((from % 1440) + 1440) % 1440;
    const normTo = normFrom + (to - from);

    dayMinutes += intersectMinutes(normFrom, normTo, DAY_START_MINUTES, DAY_END_MINUTES);
    nightMinutes += intersectMinutes(normFrom, normTo, DAY_END_MINUTES, DAY_START_MINUTES + 1440);
    nightMinutes += intersectMinutes(normFrom, normTo, 0, DAY_START_MINUTES);
  }

  return { dayMinutes, nightMinutes };
}

function buildDaySegments(startMin, endMin) {
  if (endMin <= startMin) endMin += 1440;
  if (endMin <= 1440) return [{ from: startMin, to: endMin }];
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

async function getSitePayRates(workSiteId, dateStr) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const policy = await prisma.sitePayPolicy.findFirst({
    where: {
      work_site_id: workSiteId,
      effective_from: { lte: dateStr },
      OR: [{ effective_to: null }, { effective_to: { gte: dateStr } }],
    },
    orderBy: { effective_from: "desc" },
    include: {
      rates: {
        select: { pay_type: true, multiplier: true, fixed_amount: true, calculation_method: true },
      },
    },
  });

  if (!policy) return {};
  return Object.fromEntries(policy.rates.map((r) => [r.pay_type, r]));
}

async function isPublicHoliday(dateStr) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const data = await prisma.publicHoliday.findFirst({
    where: { holiday_date: dateStr, country_code: "LA" },
    select: { id: true, holiday_name: true },
  });
  return { isHoliday: !!data, name: data?.holiday_name ?? null };
}

export async function calculateExtraPay({
  employeeId,
  workDate,
  clockIn,
  clockOut,
  requestType = "OT",
  pieces = null,
}) {
  const [year, month] = workDate.split("-").map(Number);

  const [rateInfo, { isWorkDay, shiftType }, { isHoliday, name: holidayName }] = await Promise.all([
    calculateHourlyRate(employeeId, year, month),
    isEmployeeWorkDay(employeeId, workDate),
    isPublicHoliday(workDate),
  ]);

  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const paySettings = await prisma.payrollSettings.findUnique({
    where: { employee_id: employeeId },
    select: { work_site_id: true },
  });

  const workSiteId = paySettings?.work_site_id;
  const payRates = workSiteId ? await getSitePayRates(workSiteId, workDate) : {};

  const startMin = timeToMinutes(clockIn);
  let endMin = timeToMinutes(clockOut);
  if (endMin <= startMin) endMin += 1440;

  const totalMinutes = endMin - startMin;
  const totalHours = totalMinutes / 60;

  const { dayMinutes, nightMinutes } = splitDayNight(startMin, endMin);
  const dayHours = dayMinutes / 60;
  const nightHours = nightMinutes / 60;

  const isHolidayWork = isHoliday || requestType === "HOLIDAY";
  const isPieceWork = requestType === "PIECE_WORK";
  const isLunchOT = requestType === "LUNCH_OT";

  let prefix;
  if (isHolidayWork) prefix = "HOLIDAY";
  else if (isPieceWork) prefix = "PIECE_WORK";
  else prefix = "OT_NORMAL";

  const dayPayType = `${prefix}_DAY`;
  const nightPayType = `${prefix}_NIGHT`;

  const dayRate = payRates[dayPayType];
  const nightRate = payRates[nightPayType];
  const hourlyRate = rateInfo.hourlyRate;

  let dayAmount = 0;
  let nightAmount = 0;

  if (isLunchOT) {
    const lunchRate = payRates["LUNCH_OT"];
    const calc = lunchRate?.calculation_method ?? "multiplier";
    if (calc === "fixed" && lunchRate?.fixed_amount) {
      dayAmount = lunchRate.fixed_amount;
    } else {
      const mult = lunchRate?.multiplier ?? 1;
      dayAmount = Math.round(hourlyRate * mult * totalHours);
    }
  } else {
    if (dayHours > 0 && dayRate) {
      const calc = dayRate.calculation_method ?? "multiplier";
      if (calc === "fixed") {
        dayAmount = dayRate.fixed_amount ?? 0;
      } else {
        dayAmount = Math.round(hourlyRate * (dayRate.multiplier ?? 1) * dayHours);
      }
    }

    if (nightHours > 0 && nightRate) {
      const calc = nightRate.calculation_method ?? "multiplier";
      if (calc === "fixed") {
        nightAmount = nightRate.fixed_amount ?? 0;
      } else {
        nightAmount = Math.round(hourlyRate * (nightRate.multiplier ?? 1) * nightHours);
      }
    }
  }

  let nightAllowance = 0;
  if (nightHours > 0 && payRates["NIGHT_ALLOWANCE"]) {
    const na = payRates["NIGHT_ALLOWANCE"];
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
    currency: "LAK",
    rateBreakdown: rateInfo,
  };
}

export async function batchCalculateExtraPay(requestIds) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const requests = await prisma.extraPayRequest.findMany({
    where: { id: { in: requestIds }, status: "approved" },
    select: {
      id: true,
      employee_id: true,
      work_date: true,
      planned_clock_in: true,
      planned_clock_out: true,
      request_type: true,
    },
  });

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

export async function getExtraPaySummaryForEmployee(employeeId, periodMonth) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const [year, month] = periodMonth.split("-").map(Number);
  const from = `${periodMonth}-01`;
  const to = new Date(year, month, 0).toISOString().slice(0, 10);

  const data = await prisma.extraPayRecord.findMany({
    where: {
      employee_id: employeeId,
      work_date: { gte: from, lte: to },
    },
    select: { pay_type: true, hours: true, amount: true },
  });

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
