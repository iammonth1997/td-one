import { validateSession } from "@/lib/validateSession";
import { supabaseServer } from "@/lib/supabaseServer";

const ALLOWED_ROLES = new Set([
  "admin",
  "super_admin",
  "hr_payroll",
  "hr-payroll",
  "hr payroll",
  "hrpayroll",
]);

function canResetDevice(role) {
  return ALLOWED_ROLES.has(String(role || "").trim().toLowerCase());
}

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  if (!canResetDevice(session.role)) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { data, error } = await supabaseServer
    .from("employee_devices")
    .select("id, employee_id, device_id, device_name, registered_at, is_active")
    .order("registered_at", { ascending: false })
    .limit(200);

  if (error) {
    return Response.json({ error: "DEVICE_LIST_FAILED", detail: error.message }, { status: 500 });
  }

  return Response.json({ success: true, rows: data || [] });
}

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  if (!canResetDevice(session.role)) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { employee_code } = await req.json();
  const empCode = String(employee_code || "").trim().toUpperCase();
  if (!empCode) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const { data: employee, error: employeeError } = await supabaseServer
    .from("employees")
    .select("id, employee_code")
    .eq("employee_code", empCode)
    .maybeSingle();

  if (employeeError) {
    return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
  }

  if (!employee) {
    return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });
  }

  const { error: updateError } = await supabaseServer
    .from("employee_devices")
    .update({ is_active: false })
    .eq("employee_id", employee.id);

  if (updateError) {
    return Response.json({ error: "RESET_DEVICE_FAILED", detail: updateError.message }, { status: 500 });
  }

  return Response.json({ success: true, employee_code: empCode });
}
