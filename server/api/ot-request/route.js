import { validateSession } from "@/lib/validateSession";
import prisma from "@/lib/prisma";
import {
  calculateOtHours,
  findExistingOtOnDate,
  getEmployeeByEmpCode,
  getOtLimits,
  getOtTypeByCode,
  hasLeaveOnDate,
  validateOtDate,
} from "@/lib/otRequestUtils";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const accessProfile = buildSessionAccessProfile(session);
  if (!hasAnyPermission(accessProfile, ["ot.request.self", "ot.approve.section", "ot.approve.department", "ot.approve.company", "ot.read.all"])) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json();
  const date = String(body.date || "").trim();
  const otTypeCode = String(body.ot_type_code || "").trim().toLowerCase();
  const startTime = String(body.start_time || "").trim();
  const endTime = String(body.end_time || "").trim();
  const reason = String(body.reason || "").trim();
  const projectRef = body.project_ref ? String(body.project_ref).trim() : null;

  const dateCheck = validateOtDate(date);
  if (!dateCheck.ok) {
    return Response.json({ error: dateCheck.error, detail: dateCheck }, { status: 400 });
  }

  const calc = calculateOtHours(startTime, endTime);
  if (!calc.ok) {
    return Response.json({ error: calc.error }, { status: 400 });
  }

  const limits = getOtLimits();
  if (calc.totalHours < limits.minHours || calc.totalHours > limits.maxHours) {
    return Response.json({ error: "INVALID_OT_HOURS", min: limits.minHours, max: limits.maxHours }, { status: 400 });
  }

  if (reason.length < 20) {
    return Response.json({ error: "REASON_TOO_SHORT", min_length: 20 }, { status: 400 });
  }

  const { employee, error: employeeError } = await getEmployeeByEmpCode(session.emp_id);
  if (employeeError) {
    return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
  }
  if (!employee) {
    return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });
  }

  const { otType, error: otTypeError } = await getOtTypeByCode(otTypeCode);
  if (otTypeError) {
    return Response.json({ error: "OT_TYPE_QUERY_FAILED", detail: otTypeError.message }, { status: 500 });
  }
  if (!otType) {
    return Response.json({ error: "OT_TYPE_NOT_FOUND" }, { status: 400 });
  }

  const leaveCheck = await hasLeaveOnDate(employee.id, date);
  if (leaveCheck.error) {
    return Response.json({ error: "LEAVE_CHECK_FAILED", detail: leaveCheck.error.message }, { status: 500 });
  }
  if (leaveCheck.conflict) {
    return Response.json({ error: "LEAVE_CONFLICT" }, { status: 400 });
  }

  const duplicateCheck = await findExistingOtOnDate(employee.id, date);
  if (duplicateCheck.error) {
    return Response.json({ error: "OT_DUPLICATE_CHECK_FAILED", detail: duplicateCheck.error.message }, { status: 500 });
  }

  const hasDuplicate = duplicateCheck.rows.some((row) => ["pending", "approved"].includes(row.status));
  if (hasDuplicate) {
    return Response.json({
      error: "DUPLICATE_OT_REQUEST",
      warning: true,
      existing: duplicateCheck.rows,
    }, { status: 409 });
  }

  try {
    const data = await prisma.otRequest.create({
      data: {
        employee_id: employee.id,
        ot_type_code: otType.code,
        date,
        start_time: startTime,
        end_time: endTime,
        total_hours: calc.totalHours,
        rate_multiplier: Number(otType.rate_multiplier),
        reason,
        project_ref: projectRef,
        status: "pending",
        cross_midnight: calc.crossMidnight,
      },
    });
    return Response.json({ success: true, row: data, warning: duplicateCheck.rows.length > 0 }, { status: 201 });
  } catch (err) {
    return Response.json({ error: "OT_REQUEST_CREATE_FAILED", detail: err.message }, { status: 500 });
  }
}

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const accessProfile = buildSessionAccessProfile(session);
  if (!hasAnyPermission(accessProfile, ["ot.read.self", "ot.read.team", "ot.read.department", "ot.read.all", "ot.request.self"])) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { employee, error: employeeError } = await getEmployeeByEmpCode(session.emp_id);
  if (employeeError) {
    return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
  }
  if (!employee) {
    return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const status = String(searchParams.get("status") || "").trim().toLowerCase();
  const dateFrom = String(searchParams.get("date_from") || "").trim();
  const dateTo = String(searchParams.get("date_to") || "").trim();
  const empCode = String(searchParams.get("emp_id") || "").trim().toUpperCase();
  const limit = Math.min(Number(searchParams.get("limit") || 50), 200);

  const where = {};

  if (hasAnyPermission(accessProfile, ["ot.read.all", "rbac.manage"]) && empCode) {
    try {
      const empLookup = await prisma.employee.findFirst({ where: { employee_code: empCode }, select: { id: true } });
      if (!empLookup) return Response.json({ success: true, rows: [] });
      where.employee_id = empLookup.id;
    } catch (err) {
      return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: err.message }, { status: 500 });
    }
  } else {
    where.employee_id = employee.id;
  }

  if (status) where.status = status;
  if (dateFrom || dateTo) {
    where.date = {};
    if (dateFrom) where.date.gte = dateFrom;
    if (dateTo) where.date.lte = dateTo;
  }

  try {
    const rows = await prisma.otRequest.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: limit,
      select: {
        id: true,
        employee_id: true,
        ot_type_code: true,
        date: true,
        start_time: true,
        end_time: true,
        total_hours: true,
        rate_multiplier: true,
        reason: true,
        project_ref: true,
        status: true,
        approved_by: true,
        approved_at: true,
        rejected_reason: true,
        cross_midnight: true,
        created_at: true,
        updated_at: true,
      },
    });

    const otTypes = await prisma.otType.findMany({
      select: { code: true, name_lo: true, name_th: true, name_en: true, rate_multiplier: true },
    });

    const typeMap = new Map(otTypes.map((item) => [item.code, item]));
    const result = rows.map((row) => ({ ...row, ot_type: typeMap.get(row.ot_type_code) || null }));

    return Response.json({ success: true, rows: result, limits: getOtLimits() });
  } catch (err) {
    return Response.json({ error: "OT_REQUEST_QUERY_FAILED", detail: err.message }, { status: 500 });
  }
}
