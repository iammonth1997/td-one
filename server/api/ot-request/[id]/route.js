import { validateSession } from "@/lib/validateSession";
import { supabaseServer } from "@/lib/supabaseServer";
import { getEmployeeByEmpCode } from "@/lib/otRequestUtils";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const accessProfile = buildSessionAccessProfile(session);
  if (!hasAnyPermission(accessProfile, ["ot.read.self", "ot.read.team", "ot.read.department", "ot.read.all", "ot.request.self"])) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const id = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  if (!id) {
    return Response.json({ error: "INVALID_ID" }, { status: 400 });
  }

  const { data: row, error } = await supabaseServer
    .from("ot_requests")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return Response.json({ error: "OT_REQUEST_QUERY_FAILED", detail: error.message }, { status: 500 });
  }
  if (!row) {
    return Response.json({ error: "OT_REQUEST_NOT_FOUND" }, { status: 404 });
  }

  if (!hasAnyPermission(accessProfile, ["ot.read.all", "rbac.manage"])) {
    const { employee, error: employeeError } = await getEmployeeByEmpCode(session.emp_id);
    if (employeeError) {
      return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
    }
    if (!employee || row.employee_id !== employee.id) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  }

  return Response.json({ success: true, row });
}

export async function PUT(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const accessProfile = buildSessionAccessProfile(session);
  if (!hasAnyPermission(accessProfile, ["ot.request.self", "ot.approve.section", "ot.approve.department", "ot.approve.company", "ot.read.all", "rbac.manage"])) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const id = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  if (!id) {
    return Response.json({ error: "INVALID_ID" }, { status: 400 });
  }

  const body = await req.json();
  const action = String(body.action || "").trim().toLowerCase();
  if (!["cancel", "approve", "reject"].includes(action)) {
    return Response.json({ error: "UNSUPPORTED_ACTION" }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabaseServer
    .from("ot_requests")
    .select("id, employee_id, status")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return Response.json({ error: "OT_REQUEST_QUERY_FAILED", detail: existingError.message }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: "OT_REQUEST_NOT_FOUND" }, { status: 404 });
  }

  if (action === "approve" || action === "reject") {
    const isAdminOrApprover = hasAnyPermission(accessProfile, ["ot.approve.section", "ot.approve.department", "ot.approve.company", "ot.read.all", "rbac.manage"]);
    if (!isAdminOrApprover) {
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
      .from("ot_requests")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (updateError) {
      return Response.json({ error: "OT_REQUEST_UPDATE_FAILED", detail: updateError.message }, { status: 500 });
    }

    return Response.json({ success: true, row });
  }

  const admin = hasAnyPermission(accessProfile, ["ot.approve.company", "ot.read.all", "rbac.manage"]);
  if (!admin) {
    const { employee, error: employeeError } = await getEmployeeByEmpCode(session.emp_id);
    if (employeeError) {
      return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
    }
    if (!employee || existing.employee_id !== employee.id) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }
  }

  if (!["pending", "approved"].includes(existing.status)) {
    return Response.json({ error: "CANNOT_CANCEL_STATUS" }, { status: 400 });
  }

  const { data: row, error: updateError } = await supabaseServer
    .from("ot_requests")
    .update({ status: "cancelled", updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (updateError) {
    return Response.json({ error: "OT_REQUEST_CANCEL_FAILED", detail: updateError.message }, { status: 500 });
  }

  return Response.json({ success: true, row });
}
