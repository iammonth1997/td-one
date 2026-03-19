import { validateSession } from "@/lib/validateSession";
import { supabaseServer } from "@/lib/supabaseServer";
import { getEmployeeByEmpCode } from "@/lib/otRequestUtils";
import { buildSessionAccessProfile, canManageAdminActions } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";

export async function PUT(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const accessProfile = buildSessionAccessProfile(session);
  if (!hasAnyPermission(accessProfile, ["leave.request.self", "leave.approve.section", "leave.approve.department", "leave.approve.company"]) && !canManageAdminActions(session, accessProfile)) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const id = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  if (!id) {
    return Response.json({ error: "INVALID_ID" }, { status: 400 });
  }

  const body = await req.json();
  const action = String(body.action || "").trim().toLowerCase();
  if (!["cancel", "delete", "approve", "reject"].includes(action)) {
    return Response.json({ error: "UNSUPPORTED_ACTION" }, { status: 400 });
  }

  const { data: existing, error: queryError } = await supabaseServer
    .from("leave_requests")
    .select("id, employee_id, leave_type_code, status, attachment_url")
    .eq("id", id)
    .maybeSingle();

  if (queryError) {
    return Response.json({ error: "LEAVE_REQUEST_QUERY_FAILED", detail: queryError.message }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: "LEAVE_REQUEST_NOT_FOUND" }, { status: 404 });
  }

  if (action === "approve" || action === "reject") {
    if (!canManageAdminActions(session, accessProfile)) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
    if (existing.status !== "pending") {
      return Response.json({ error: "CAN_ONLY_ACTION_PENDING_REQUESTS" }, { status: 400 });
    }

    const { employee: approver, error: employeeError } = await getEmployeeByEmpCode(session.emp_id);
    if (employeeError) {
      return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
    }
    if (!approver) {
      return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 404 });
    }

    const nowIso = new Date().toISOString();
    const patch =
      action === "approve"
        ? { status: "approved", approved_by: approver.id, approved_at: nowIso, rejected_reason: null, updated_at: nowIso }
        : { status: "rejected", rejected_reason: String(body.reason || "").trim() || null, updated_at: nowIso };

    const { data: row, error: updateError } = await supabaseServer
      .from("leave_requests")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (updateError) {
      return Response.json({ error: "LEAVE_REQUEST_UPDATE_FAILED", detail: updateError.message }, { status: 500 });
    }

    return Response.json({ success: true, row });
  }

  if (!canManageAdminActions(session, accessProfile)) {
    const { employee, error: employeeError } = await getEmployeeByEmpCode(session.emp_id);
    if (employeeError) {
      return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
    }
    if (!employee || existing.employee_id !== employee.id) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  }

  if (!["pending", "approved", "cancelled"].includes(existing.status)) {
    return Response.json({ error: "CANNOT_CANCEL_STATUS" }, { status: 400 });
  }

  if (existing.status === "cancelled") {
    return Response.json({ success: true, row: existing });
  }

  const nowIso = new Date().toISOString();
  const deleteAfterIso = new Date(Date.now() + (60 * 24 * 60 * 60 * 1000)).toISOString();
  const hasAttachment = Boolean(existing.attachment_url);

  const updatePayload = {
    status: "cancelled",
    cancelled_at: nowIso,
    updated_at: nowIso,
    attachment_active: false,
    attachment_inactivated_at: hasAttachment ? nowIso : null,
    attachment_delete_after: hasAttachment ? deleteAfterIso : null,
  };

  const { data: row, error: updateError } = await supabaseServer
    .from("leave_requests")
    .update(updatePayload)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (updateError) {
    return Response.json({ error: "LEAVE_REQUEST_CANCEL_FAILED", detail: updateError.message }, { status: 500 });
  }

  return Response.json({ success: true, row });
}
