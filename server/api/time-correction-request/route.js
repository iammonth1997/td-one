import { validateSession } from "@/lib/validateSession";
import { getPrisma } from "@/lib/prisma";
import { getEmployeeByEmpCode } from "@/lib/otRequestUtils";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";

const ALLOWED_TYPES = new Set(["forgot_in", "forgot_out", "forgot_both"]);

export async function POST(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const accessProfile = buildSessionAccessProfile(session);
  if (!hasAnyPermission(accessProfile, ["time_correction.request.self", "time_correction.read.all", "rbac.manage"])) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

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

  try {
    const inserted = await prisma.timeCorrectionRequest.create({
      data: {
        employee_id: employee.id,
        date,
        correction_type: correctionType,
        requested_scan_in: requestedScanIn,
        requested_scan_out: requestedScanOut,
        reason,
        status: "pending",
      },
    });
    return Response.json({ success: true, row: inserted }, { status: 201 });
  } catch (err) {
    return Response.json({ error: "TIME_CORRECTION_CREATE_FAILED", detail: err.message }, { status: 500 });
  }
}

export async function GET(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const accessProfile = buildSessionAccessProfile(session);
  if (!hasAnyPermission(accessProfile, ["time_correction.read.self", "time_correction.read.all", "time_correction.request.self", "rbac.manage"])) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { employee, error: employeeError } = await getEmployeeByEmpCode(session.emp_id);
  if (employeeError) return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
  if (!employee) return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });

  try {
    const rows = await prisma.timeCorrectionRequest.findMany({
      where: { employee_id: employee.id },
      orderBy: { created_at: "desc" },
      take: 50,
    });
    return Response.json({ success: true, rows: rows || [] });
  } catch (err) {
    return Response.json({ error: "TIME_CORRECTION_QUERY_FAILED", detail: err.message }, { status: 500 });
  }
}
