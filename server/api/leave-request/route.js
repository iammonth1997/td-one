import { validateSession } from "@/lib/validateSession";
import { getPrisma } from "@/lib/prisma";
import { getEmployeeByEmpCode } from "@/lib/otRequestUtils";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";

function calcLeaveDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00+07:00`);
  const end = new Date(`${endDate}T00:00:00+07:00`);
  const diff = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
  return Number((diff + 1).toFixed(1));
}

export async function POST(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const accessProfile = buildSessionAccessProfile(session);
  if (!hasAnyPermission(accessProfile, ["leave.request.self", "leave.approve.section", "leave.approve.department", "leave.approve.company"])) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = await req.json();
  const leaveTypeCode = String(body.leave_type_code || "").trim().toLowerCase();
  const startDate = String(body.start_date || "").trim();
  const endDate = String(body.end_date || "").trim();
  const reason = String(body.reason || "").trim();
  const attachmentUrl = body.attachment_url ? String(body.attachment_url).trim() : null;
  const attachmentPublicId = body.attachment_public_id ? String(body.attachment_public_id).trim() : null;
  const attachmentResourceType = body.attachment_resource_type ? String(body.attachment_resource_type).trim() : null;

  if (!leaveTypeCode || !startDate || !endDate || !reason) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }
  if (startDate > endDate) {
    return Response.json({ error: "INVALID_DATE_RANGE" }, { status: 400 });
  }

  const totalDays = calcLeaveDays(startDate, endDate);
  if (totalDays <= 0) {
    return Response.json({ error: "INVALID_DATE_RANGE" }, { status: 400 });
  }

  const { employee, error: employeeError } = await getEmployeeByEmpCode(session.emp_id);
  if (employeeError) return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
  if (!employee) return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });

  try {
    const leaveType = await prisma.leaveType.findFirst({
      where: { code: leaveTypeCode, is_active: true },
      select: { code: true, max_days_per_year: true, is_active: true },
    });
    if (!leaveType) return Response.json({ error: "LEAVE_TYPE_NOT_FOUND" }, { status: 400 });

    const currentYear = Number(startDate.slice(0, 4));
    const balance = await prisma.leaveBalance.findFirst({
      where: { employee_id: employee.id, leave_type_code: leaveTypeCode, year: currentYear },
      select: { id: true, total_days: true, used_days: true },
    });

    if (leaveType.max_days_per_year !== null) {
      const total = balance?.total_days ?? leaveType.max_days_per_year;
      const used = balance?.used_days ?? 0;
      const remaining = total - used;
      if (totalDays > remaining) {
        return Response.json({ error: "INSUFFICIENT_LEAVE_BALANCE", remaining_days: remaining }, { status: 400 });
      }
    }

    const inserted = await prisma.leaveRequest.create({
      data: {
        employee_id: employee.id,
        leave_type_code: leaveTypeCode,
        start_date: startDate,
        end_date: endDate,
        total_days: totalDays,
        reason,
        attachment_url: attachmentUrl,
        attachment_public_id: attachmentPublicId,
        attachment_resource_type: attachmentResourceType,
        attachment_active: attachmentUrl ? true : false,
        status: "pending",
      },
    });

    return Response.json({ success: true, row: inserted }, { status: 201 });
  } catch (err) {
    if (err.message?.includes("leave_type")) {
      return Response.json({ error: "LEAVE_TYPE_QUERY_FAILED", detail: err.message }, { status: 500 });
    }
    return Response.json({ error: "LEAVE_REQUEST_CREATE_FAILED", detail: err.message }, { status: 500 });
  }
}

export async function GET(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const accessProfile = buildSessionAccessProfile(session);
  if (!hasAnyPermission(accessProfile, ["leave.request.self", "leave.approve.section", "leave.approve.department", "leave.approve.company"])) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { employee, error: employeeError } = await getEmployeeByEmpCode(session.emp_id);
  if (employeeError) return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
  if (!employee) return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });

  try {
    const requests = await prisma.leaveRequest.findMany({
      where: { employee_id: employee.id },
      orderBy: { created_at: "desc" },
      take: 50,
    });

    const year = new Date().getFullYear();
    const balances = await prisma.leaveBalance.findMany({
      where: { employee_id: employee.id, year },
      select: { leave_type_code: true, total_days: true, used_days: true },
    });

    const leaveTypes = await prisma.leaveType.findMany({
      where: { is_active: true },
      orderBy: { code: "asc" },
      select: { code: true, name_lo: true, name_th: true, name_en: true, max_days_per_year: true, is_paid: true, is_active: true },
    });

    const sanitizedRows = (requests || []).map((row) => {
      const fileVisible = row.attachment_active !== false && !row.attachment_deleted_at && row.status !== "cancelled";
      if (fileVisible) return row;
      return { ...row, attachment_url: null, attachment_public_id: null };
    });

    return Response.json({
      success: true,
      rows: sanitizedRows,
      leave_types: leaveTypes || [],
      leave_balances: balances || [],
      year,
    });
  } catch (err) {
    return Response.json({ error: "LEAVE_REQUEST_QUERY_FAILED", detail: err.message }, { status: 500 });
  }
}
