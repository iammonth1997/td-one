import { validateSession } from "@/lib/validateSession";
import { supabaseServer } from "@/lib/supabaseServer";
import { buildSessionAccessProfile, canManageAdminActions } from "@/lib/rbac/sessionAccess";

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const accessProfile = buildSessionAccessProfile(session);
  if (!canManageAdminActions(session, accessProfile)) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status = String(searchParams.get("status") || "pending").toLowerCase();
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 50), 1), 500);

  let query = supabaseServer
    .from("attendance_suspicious_scans")
    .select("id, employee_id, employee_code, attendance_id, scan_timestamp, gps_position, suspicion_score, suspicion_flags, face_match_score, device_id, scan_status, review_action, review_note, reviewed_by_emp_id, reviewed_at, created_at, updated_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status === "pending") {
    query = query.eq("scan_status", "flagged").eq("review_action", "pending");
  } else if (status === "flagged" || status === "blocked" || status === "normal") {
    query = query.eq("scan_status", status);
  }

  const { data, error } = await query;
  if (error) {
    return Response.json({ error: "SUSPICIOUS_SCAN_QUERY_FAILED", detail: error.message }, { status: 500 });
  }

  return Response.json({ success: true, rows: data || [] });
}
