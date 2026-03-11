import { validateSession } from "@/lib/validateSession";
import { supabaseServer } from "@/lib/supabaseServer";
import { getEmployeeByEmpCode } from "@/lib/otRequestUtils";

function statusIcon(status) {
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  if (status === "cancelled") return "cancelled";
  return "pending";
}

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const { employee, error: employeeError } = await getEmployeeByEmpCode(session.emp_id);
  if (employeeError) return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
  if (!employee) return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const type = String(searchParams.get("type") || "all").trim().toLowerCase();
  const status = String(searchParams.get("status") || "all").trim().toLowerCase();

  const list = [];

  if (type === "all" || type === "leave") {
    const { data: leaves, error } = await supabaseServer
      .from("leave_requests")
      .select("id, leave_type_code, start_date, end_date, total_days, reason, status, created_at")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return Response.json({ error: "LEAVE_REQUEST_QUERY_FAILED", detail: error.message }, { status: 500 });

    for (const row of leaves || []) {
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
  }

  if (type === "all" || type === "time_correction") {
    const { data: corrections, error } = await supabaseServer
      .from("time_correction_requests")
      .select("id, date, correction_type, requested_scan_in, requested_scan_out, reason, status, created_at")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return Response.json({ error: "TIME_CORRECTION_QUERY_FAILED", detail: error.message }, { status: 500 });

    for (const row of corrections || []) {
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
  }

  if (type === "all" || type === "ot") {
    const { data: ots, error } = await supabaseServer
      .from("ot_requests")
      .select("id, ot_type_code, date, start_time, end_time, total_hours, reason, status, created_at")
      .eq("employee_id", employee.id)
      .order("created_at", { ascending: false })
      .limit(100);

    if (error) return Response.json({ error: "OT_REQUEST_QUERY_FAILED", detail: error.message }, { status: 500 });

    for (const row of ots || []) {
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
  }

  let rows = list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  if (status !== "all") {
    rows = rows.filter((row) => row.status === status);
  }

  return Response.json({ success: true, rows });
}
