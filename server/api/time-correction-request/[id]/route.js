import { validateSession } from "@/lib/validateSession";
import prisma from "@/lib/prisma";
import { buildSessionAccessProfile, canManageAdminActions } from "@/lib/rbac/sessionAccess";
import { getEmployeeByEmpCode } from "@/lib/otRequestUtils";

export async function PUT(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const accessProfile = buildSessionAccessProfile(session);
  if (!canManageAdminActions(session, accessProfile)) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const id = new URL(req.url).pathname.split("/").filter(Boolean).pop();
  if (!id) return Response.json({ error: "INVALID_ID" }, { status: 400 });

  const body = await req.json();
  const action = String(body.action || "").trim().toLowerCase();
  if (!["approve", "reject", "cancel"].includes(action)) {
    return Response.json({ error: "UNSUPPORTED_ACTION" }, { status: 400 });
  }

  let existing;
  try {
    existing = await prisma.timeCorrectionRequest.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
  } catch (err) {
    return Response.json({ error: "TIME_CORRECTION_QUERY_FAILED", detail: err.message }, { status: 500 });
  }
  if (!existing) return Response.json({ error: "TIME_CORRECTION_NOT_FOUND" }, { status: 404 });
  if (existing.status !== "pending") return Response.json({ error: "CAN_ONLY_ACTION_PENDING_REQUESTS" }, { status: 400 });

  const { employee: approver, error: employeeError } = await getEmployeeByEmpCode(session.emp_id);
  if (employeeError) return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
  if (!approver) return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 404 });

  let patch = {};
  if (action === "approve") {
    patch = { status: "approved", approved_by: approver.id, approved_at: new Date(), rejected_reason: null };
  } else if (action === "reject") {
    patch = { status: "rejected", rejected_reason: String(body.reason || "").trim() || null };
  } else {
    patch = { status: "cancelled" };
  }

  try {
    const row = await prisma.timeCorrectionRequest.update({ where: { id }, data: patch });
    return Response.json({ success: true, row });
  } catch (err) {
    return Response.json({ error: "TIME_CORRECTION_UPDATE_FAILED", detail: err.message }, { status: 500 });
  }
}
