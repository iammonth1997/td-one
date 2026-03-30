import { validateSession } from "@/lib/validateSession";
import { getPrisma } from "@/lib/prisma";
import { buildSessionAccessProfile, canManageAdminActions } from "@/lib/rbac/sessionAccess";

export async function GET(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
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

  const select = {
    id: true,
    employee_id: true,
    employee_code: true,
    attendance_id: true,
    scan_timestamp: true,
    gps_position: true,
    suspicion_score: true,
    suspicion_flags: true,
    face_match_score: true,
    device_id: true,
    scan_status: true,
    review_action: true,
    review_note: true,
    reviewed_by_emp_id: true,
    reviewed_at: true,
    created_at: true,
    updated_at: true,
  };

  let where = {};
  if (status === "pending") {
    where = { scan_status: "flagged", review_action: "pending" };
  } else if (status === "flagged" || status === "blocked" || status === "normal") {
    where = { scan_status: status };
  }

  try {
    const data = await prisma.attendanceSuspiciousScan.findMany({
      select,
      where,
      orderBy: { created_at: "desc" },
      take: limit,
    });

    return Response.json({ success: true, rows: data });
  } catch (err) {
    return Response.json({ error: "SUSPICIOUS_SCAN_QUERY_FAILED", detail: err.message }, { status: 500 });
  }
}
