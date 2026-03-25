import { validateSession } from "@/lib/validateSession";
import prisma from "@/lib/prisma";
import { getEmployeeByEmpCode } from "@/lib/otRequestUtils";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";

function statusIcon(status) {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "cancelled") return "cancelled";
  return "pending";
}

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const accessProfile = buildSessionAccessProfile(session);
  if (!hasAnyPermission(accessProfile, [
    "leave.request.self",
    "leave.approve.section",
    "leave.approve.department",
    "leave.approve.company",
    "time_correction.read.self",
    "time_correction.read.all",
    "time_correction.request.self",
    "ot.request.self",
    "ot.read.self",
    "ot.read.team",
    "ot.read.department",
    "ot.read.all",
    "rbac.manage",
  ])) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { employee, error: employeeError } = await getEmployeeByEmpCode(session.emp_id);
  if (employeeError) return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
  if (!employee) return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const type = String(searchParams.get("type") || "all").trim().toLowerCase();
  const status = String(searchParams.get("status") || "all").trim().toLowerCase();

  const list = [];

  if (type === "all" || type === "leave") {
    try {
      const leaves = await prisma.leaveRequest.findMany({
        where: { employee_id: employee.id },
        select: { id: true, leave_type_code: true, start_date: true, end_date: true, total_days: true, reason: true, status: true, created_at: true },
        orderBy: { created_at: "desc" },
        take: 100,
      });
      for (const row of leaves) {
        list.push({
          id: row.id,
          type: "leave",
          subtype: row.leave_type_code,
          title: `Leave (${row.leave_type_code})`,
          date_label: `${row.start_date} - ${row.end_date}`,
          amount_label: `${row.total_days} day(s)`,
          reason: row.reason,
          status: row.status,
          status_tag: statusIcon(row.status),
          created_at: row.created_at,
        });
      }
    } catch (err) {
      return Response.json({ error: "LEAVE_REQUEST_QUERY_FAILED", detail: err.message }, { status: 500 });
    }
  }

  if (type === "all" || type === "time_correction") {
    try {
      const corrections = await prisma.timeCorrectionRequest.findMany({
        where: { employee_id: employee.id },
        select: { id: true, date: true, correction_type: true, requested_scan_in: true, requested_scan_out: true, reason: true, status: true, created_at: true },
        orderBy: { created_at: "desc" },
        take: 100,
      });
      for (const row of corrections) {
        list.push({
          id: row.id,
          type: "time_correction",
          subtype: row.correction_type,
          title: `Time Correction (${row.correction_type})`,
          date_label: row.date,
          amount_label: `${row.requested_scan_in || "-"} / ${row.requested_scan_out || "-"}`,
          reason: row.reason,
          status: row.status,
          status_tag: statusIcon(row.status),
          created_at: row.created_at,
        });
      }
    } catch (err) {
      return Response.json({ error: "TIME_CORRECTION_QUERY_FAILED", detail: err.message }, { status: 500 });
    }
  }

  if (type === "all" || type === "ot") {
    try {
      const ots = await prisma.otRequest.findMany({
        where: { employee_id: employee.id },
        select: { id: true, ot_type_code: true, date: true, start_time: true, end_time: true, total_hours: true, reason: true, status: true, created_at: true },
        orderBy: { created_at: "desc" },
        take: 100,
      });
      for (const row of ots) {
        list.push({
          id: row.id,
          type: "ot",
          subtype: row.ot_type_code,
          title: `OT (${row.ot_type_code})`,
          date_label: row.date,
          amount_label: `${row.start_time} - ${row.end_time} (${row.total_hours}h)`,
          reason: row.reason,
          status: row.status,
          status_tag: statusIcon(row.status),
          created_at: row.created_at,
        });
      }
    } catch (err) {
      return Response.json({ error: "OT_REQUEST_QUERY_FAILED", detail: err.message }, { status: 500 });
    }
  }

  let rows = list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  if (status !== "all") {
    rows = rows.filter((row) => row.status === status);
  }

  return Response.json({ success: true, rows });
}
