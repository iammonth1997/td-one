import { validateSession } from "@/lib/validateSession";
import { supabaseServer } from "@/lib/supabaseServer";
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

  const rateMultiplier = Number(otType.rate_multiplier);
  const { data, error } = await supabaseServer
    .from("ot_requests")
    .insert({
      employee_id: employee.id,
      ot_type_code: otType.code,
      date,
      start_time: startTime,
      end_time: endTime,
      total_hours: calc.totalHours,
      rate_multiplier: rateMultiplier,
      reason,
      project_ref: projectRef,
      status: "pending",
      cross_midnight: calc.crossMidnight,
    })
    .select("*")
    .maybeSingle();

  if (error) {
    return Response.json({ error: "OT_REQUEST_CREATE_FAILED", detail: error.message }, { status: 500 });
  }

  return Response.json({ success: true, row: data, warning: duplicateCheck.rows.length > 0 }, { status: 201 });
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

  let query = supabaseServer
    .from("ot_requests")
    .select("id, employee_id, ot_type_code, date, start_time, end_time, total_hours, rate_multiplier, reason, project_ref, status, approved_by, approved_at, rejected_reason, cross_midnight, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (hasAnyPermission(accessProfile, ["ot.read.all", "rbac.manage"]) && empCode) {
    const employeeLookup = await getEmployeeByEmpCode(empCode);
    if (employeeLookup.error) {
      return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeLookup.error.message }, { status: 500 });
    }
    if (!employeeLookup.employee) {
      return Response.json({ success: true, rows: [] });
    }
    query = query.eq("employee_id", employeeLookup.employee.id);
  } else {
    query = query.eq("employee_id", employee.id);
  }

  if (status) {
    query = query.eq("status", status);
  }

  if (dateFrom) {
    query = query.gte("date", dateFrom);
  }
  if (dateTo) {
    query = query.lte("date", dateTo);
  }

  const { data: rows, error } = await query;
  if (error) {
    return Response.json({ error: "OT_REQUEST_QUERY_FAILED", detail: error.message }, { status: 500 });
  }

  const { data: otTypes, error: otTypeError } = await supabaseServer
    .from("ot_types")
    .select("code, name_lo, name_th, name_en, rate_multiplier");

  if (otTypeError) {
    return Response.json({ error: "OT_TYPE_QUERY_FAILED", detail: otTypeError.message }, { status: 500 });
  }

  const typeMap = new Map((otTypes || []).map((item) => [item.code, item]));
  const result = (rows || []).map((row) => ({
    ...row,
    ot_type: typeMap.get(row.ot_type_code) || null,
  }));

  return Response.json({ success: true, rows: result, limits: getOtLimits() });
}
