/**
 * GET /api/admin/requests  — admin view of all pending requests across leave / OT / time-correction
 * ?status=pending|approved|rejected|all  (default: pending)
 * ?type=leave|ot|time_correction|all     (default: all)
 * ?limit=<n>                             (default 100)
 */
import { validateSession } from "@/lib/validateSession";
import { supabaseServer } from "@/lib/supabaseServer";
import { buildSessionAccessProfile, canManageAdminActions } from "@/lib/rbac/sessionAccess";

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const accessProfile = buildSessionAccessProfile(session);
  if (!canManageAdminActions(session, accessProfile)) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = String(searchParams.get("status") || "pending").toLowerCase();
  const type = String(searchParams.get("type") || "all").toLowerCase();
  const limit = Math.min(Number(searchParams.get("limit") || 100), 500);
  const statusFilter = status === "all" ? null : status;

  const results = [];

  if (type === "all" || type === "leave") {
    let q = supabaseServer
      .from("leave_requests")
      .select("id, employee_id, leave_type_code, start_date, end_date, total_days, reason, status, created_at, employee:employees(employee_code)")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (statusFilter) q = q.eq("status", statusFilter);
    const { data, error } = await q;
    if (!error && data) {
      for (const r of data) {
        results.push({
          ...r,
          request_type: "leave",
          emp_code: r.employee?.employee_code ?? null,
          leave_type: r.leave_type_code,
        });
      }
    }
  }

  if (type === "all" || type === "ot") {
    let q = supabaseServer
      .from("ot_requests")
      .select("id, employee_id, date, start_time, end_time, total_hours, reason, status, created_at, employee:employees(employee_code)")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (statusFilter) q = q.eq("status", statusFilter);
    const { data, error } = await q;
    if (!error && data) {
      for (const r of data) {
        results.push({
          ...r,
          request_type: "ot",
          emp_code: r.employee?.employee_code ?? null,
          ot_hours: r.total_hours,
        });
      }
    }
  }

  if (type === "all" || type === "time_correction") {
    let q = supabaseServer
      .from("time_correction_requests")
      .select("id, employee_id, date, correction_type, requested_scan_in, requested_scan_out, reason, status, created_at, employee:employees(employee_code)")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (statusFilter) q = q.eq("status", statusFilter);
    const { data, error } = await q;
    if (!error && data) {
      for (const r of data) {
        results.push({
          ...r,
          request_type: "time_correction",
          emp_code: r.employee?.employee_code ?? null,
          correction_date: r.date,
        });
      }
    }
  }

  // Sort combined by created_at desc
  results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return Response.json({ success: true, rows: results.slice(0, limit) });
}
