import { validateSession } from "@/lib/validateSession";
import { getPrisma } from "@/lib/prisma";
import { buildSessionAccessProfile, canManageAdminActions } from "@/lib/rbac/sessionAccess";

export async function PUT(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
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

  if (!["approve", "reject"].includes(action)) {
    return Response.json({ error: "UNSUPPORTED_ACTION" }, { status: 400 });
  }

  // Look up the existing suspicious scan record
  let existing = null;
  try {
    existing = await prisma.attendanceSuspiciousScan.findUnique({
      where: { id },
      select: { id: true, attendance_id: true, scan_status: true, review_action: true },
    });
  } catch (err) {
    return Response.json({ error: "SUSPICIOUS_SCAN_QUERY_FAILED", detail: err.message }, { status: 500 });
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

  const nextAction = action === "approve" ? "approved" : "rejected";

  // Update the suspicious scan record
  let row = null;
  try {
    row = await prisma.attendanceSuspiciousScan.update({
      where: { id },
      data: {
        review_action: nextAction,
        review_note: reviewNote,
        reviewed_by_emp_id: session.emp_id,
        reviewed_at: new Date(),
      },
    });
  } catch (err) {
    return Response.json({ error: "SUSPICIOUS_SCAN_UPDATE_FAILED", detail: err.message }, { status: 500 });
  }

  // Patch the linked attendance row if present
  if (existing.attendance_id) {
    const attendancePatch = action === "reject"
      ? { status: "absent", notes: "flagged_scan_rejected" }
      : { status: "present", notes: "flagged_scan_approved" };

    try {
      await prisma.attendance.update({
        where: { id: existing.attendance_id },
        data: attendancePatch,
      });
    } catch (err) {
      return Response.json({ error: "ATTENDANCE_UPDATE_FAILED", detail: err.message }, { status: 500 });
    }
  }

  return Response.json({ success: true, row });
}
