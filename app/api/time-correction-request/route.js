import { validateSession } from "@/lib/validateSession";
import { supabaseServer } from "@/lib/supabaseServer";
import { getEmployeeByEmpCode } from "@/lib/otRequestUtils";

const ALLOWED_TYPES = new Set(["forgot_in", "forgot_out", "forgot_both"]);

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const body = await req.json();
  const date = String(body.date || "").trim();
  const correctionType = String(body.correction_type || "").trim().toLowerCase();
  const requestedScanIn = body.requested_scan_in ? String(body.requested_scan_in).trim() : null;
  const requestedScanOut = body.requested_scan_out ? String(body.requested_scan_out).trim() : null;
  const reason = String(body.reason || "").trim();

  if (!date || !ALLOWED_TYPES.has(correctionType) || !reason) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  if ((correctionType === "forgot_in" || correctionType === "forgot_both") && !requestedScanIn) {
    return Response.json({ error: "MISSING_SCAN_IN" }, { status: 400 });
  }

  if ((correctionType === "forgot_out" || correctionType === "forgot_both") && !requestedScanOut) {
    return Response.json({ error: "MISSING_SCAN_OUT" }, { status: 400 });
  }

  const { employee, error: employeeError } = await getEmployeeByEmpCode(session.emp_id);
  if (employeeError) return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
  if (!employee) return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });

  const { data: inserted, error: insertError } = await supabaseServer
    .from("time_correction_requests")
    .insert({
      employee_id: employee.id,
      date,
      correction_type: correctionType,
      requested_scan_in: requestedScanIn,
      requested_scan_out: requestedScanOut,
      reason,
      status: "pending",
    })
    .select("*")
    .maybeSingle();

  if (insertError) {
    return Response.json({ error: "TIME_CORRECTION_CREATE_FAILED", detail: insertError.message }, { status: 500 });
  }

  return Response.json({ success: true, row: inserted }, { status: 201 });
}

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const { employee, error: employeeError } = await getEmployeeByEmpCode(session.emp_id);
  if (employeeError) return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
  if (!employee) return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });

  const { data: rows, error } = await supabaseServer
    .from("time_correction_requests")
    .select("*")
    .eq("employee_id", employee.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    return Response.json({ error: "TIME_CORRECTION_QUERY_FAILED", detail: error.message }, { status: 500 });
  }

  return Response.json({ success: true, rows: rows || [] });
}
