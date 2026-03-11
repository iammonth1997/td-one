import { validateSession } from "@/lib/validateSession";
import { supabaseServer } from "@/lib/supabaseServer";
import { getEmployeeByEmpCode } from "@/lib/otRequestUtils";

function calcLeaveDays(startDate, endDate) {
  const start = new Date(`${startDate}T00:00:00+07:00`);
  const end = new Date(`${endDate}T00:00:00+07:00`);
  const diff = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
  return Number((diff + 1).toFixed(1));
}

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const body = await req.json();
  const leaveTypeCode = String(body.leave_type_code || "").trim().toLowerCase();
  const startDate = String(body.start_date || "").trim();
  const endDate = String(body.end_date || "").trim();
  const reason = String(body.reason || "").trim();
  const attachmentUrl = body.attachment_url ? String(body.attachment_url).trim() : null;

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

  const { data: leaveType, error: leaveTypeError } = await supabaseServer
    .from("leave_types")
    .select("code, max_days_per_year, is_active")
    .eq("code", leaveTypeCode)
    .eq("is_active", true)
    .maybeSingle();

  if (leaveTypeError) return Response.json({ error: "LEAVE_TYPE_QUERY_FAILED", detail: leaveTypeError.message }, { status: 500 });
  if (!leaveType) return Response.json({ error: "LEAVE_TYPE_NOT_FOUND" }, { status: 400 });

  const currentYear = Number(startDate.slice(0, 4));
  const { data: balance, error: balanceError } = await supabaseServer
    .from("leave_balances")
    .select("id, total_days, used_days")
    .eq("employee_id", employee.id)
    .eq("leave_type_code", leaveTypeCode)
    .eq("year", currentYear)
    .maybeSingle();

  if (balanceError) return Response.json({ error: "LEAVE_BALANCE_QUERY_FAILED", detail: balanceError.message }, { status: 500 });

  if (leaveType.max_days_per_year !== null) {
    const total = balance?.total_days ?? leaveType.max_days_per_year;
    const used = balance?.used_days ?? 0;
    const remaining = total - used;
    if (totalDays > remaining) {
      return Response.json({ error: "INSUFFICIENT_LEAVE_BALANCE", remaining_days: remaining }, { status: 400 });
    }
  }

  const { data: inserted, error: insertError } = await supabaseServer
    .from("leave_requests")
    .insert({
      employee_id: employee.id,
      leave_type_code: leaveTypeCode,
      start_date: startDate,
      end_date: endDate,
      total_days: totalDays,
      reason,
      attachment_url: attachmentUrl,
      status: "pending",
    })
    .select("*")
    .maybeSingle();

  if (insertError) return Response.json({ error: "LEAVE_REQUEST_CREATE_FAILED", detail: insertError.message }, { status: 500 });

  return Response.json({ success: true, row: inserted }, { status: 201 });
}

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const { employee, error: employeeError } = await getEmployeeByEmpCode(session.emp_id);
  if (employeeError) return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
  if (!employee) return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });

  const { data: requests, error } = await supabaseServer
    .from("leave_requests")
    .select("*")
    .eq("employee_id", employee.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return Response.json({ error: "LEAVE_REQUEST_QUERY_FAILED", detail: error.message }, { status: 500 });

  const year = new Date().getFullYear();
  const { data: balances, error: balanceError } = await supabaseServer
    .from("leave_balances")
    .select("leave_type_code, total_days, used_days")
    .eq("employee_id", employee.id)
    .eq("year", year);

  if (balanceError) return Response.json({ error: "LEAVE_BALANCE_QUERY_FAILED", detail: balanceError.message }, { status: 500 });

  const { data: leaveTypes, error: leaveTypeError } = await supabaseServer
    .from("leave_types")
    .select("code, name_lo, name_th, name_en, max_days_per_year, is_paid, is_active")
    .eq("is_active", true)
    .order("code", { ascending: true });

  if (leaveTypeError) return Response.json({ error: "LEAVE_TYPE_QUERY_FAILED", detail: leaveTypeError.message }, { status: 500 });

  return Response.json({
    success: true,
    rows: requests || [],
    leave_types: leaveTypes || [],
    leave_balances: balances || [],
    year,
  });
}
