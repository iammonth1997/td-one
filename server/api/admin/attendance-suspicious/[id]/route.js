import { validateSession } from "@/lib/validateSession";
import { supabaseServer } from "@/lib/supabaseServer";
import { buildSessionAccessProfile, canManageAdminActions } from "@/lib/rbac/sessionAccess";

export async function PUT(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const accessProfile = buildSessionAccessProfile(session);
  if (!canManageAdminActions(session, accessProfile)) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const id = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  if (!id) {
    return Response.json({ error: "INVALID_ID" }, { status: 400 });
  }

  const body = await req.json();
  const action = String(body.action || "").trim().toLowerCase();
  const reviewNote = String(body.note || body.reason || "").trim() || null;

  if (![
    "approve",
    "reject",
  ].includes(action)) {
    return Response.json({ error: "UNSUPPORTED_ACTION" }, { status: 400 });
  }

  const { data: existing, error: existingError } = await supabaseServer
    .from("attendance_suspicious_scans")
    .select("id, attendance_id, scan_status, review_action")
    .eq("id", id)
    .maybeSingle();

  if (existingError) {
    return Response.json({ error: "SUSPICIOUS_SCAN_QUERY_FAILED", detail: existingError.message }, { status: 500 });
  }
  if (!existing) {
    return Response.json({ error: "SUSPICIOUS_SCAN_NOT_FOUND" }, { status: 404 });
  }

  if (existing.scan_status !== "flagged") {
    return Response.json({ error: "ONLY_FLAGGED_SCANS_REQUIRE_REVIEW" }, { status: 400 });
  }

  if (existing.review_action !== "pending") {
    return Response.json({ error: "SCAN_ALREADY_REVIEWED" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const nextAction = action === "approve" ? "approved" : "rejected";

  const { data: row, error: updateError } = await supabaseServer
    .from("attendance_suspicious_scans")
    .update({
      review_action: nextAction,
      review_note: reviewNote,
      reviewed_by_emp_id: session.emp_id,
      reviewed_at: nowIso,
      updated_at: nowIso,
    })
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (updateError) {
    return Response.json({ error: "SUSPICIOUS_SCAN_UPDATE_FAILED", detail: updateError.message }, { status: 500 });
  }

  if (existing.attendance_id) {
    const attendancePatch =
      action === "reject"
        ? { status: "absent", updated_at: nowIso, notes: "flagged_scan_rejected" }
        : { status: "present", updated_at: nowIso, notes: "flagged_scan_approved" };

    const { error: attendanceError } = await supabaseServer
      .from("attendance")
      .update(attendancePatch)
      .eq("id", existing.attendance_id);

    if (attendanceError) {
      return Response.json({ error: "ATTENDANCE_UPDATE_FAILED", detail: attendanceError.message }, { status: 500 });
    }
  }

  return Response.json({ success: true, row });
}
