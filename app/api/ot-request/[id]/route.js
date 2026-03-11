import { validateSession } from "@/lib/validateSession";
import { supabaseServer } from "@/lib/supabaseServer";
import { getEmployeeByEmpCode } from "@/lib/otRequestUtils";

const ADMIN_ROLES = new Set(["admin", "super_admin", "hr_payroll", "hr-payroll", "hr payroll", "hrpayroll"]);

function isAdmin(role) {
  return ADMIN_ROLES.has(String(role || "").trim().toLowerCase());
}

export async function GET(req, { params }) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const { id } = await params;
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

  if (!isAdmin(session.role)) {
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

export async function PUT(req, { params }) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const { id } = await params;
  if (!id) {
    return Response.json({ error: "INVALID_ID" }, { status: 400 });
  }

  const body = await req.json();
  const action = String(body.action || "").trim().toLowerCase();
  if (action !== "cancel") {
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

  const admin = isAdmin(session.role);
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
