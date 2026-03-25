import { validateSession } from "@/lib/validateSession";
import prisma from "@/lib/prisma";
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

  try {
    const data = await prisma.authEmployeeDevice.findMany({
      select: {
        id: true,
        employee_id: true,
        device_id: true,
        device_name: true,
        registered_at: true,
        is_active: true,
      },
      orderBy: { registered_at: "desc" },
      take: 200,
    });

    return Response.json({ success: true, rows: data });
  } catch (err) {
    return Response.json({ error: "DEVICE_LIST_FAILED", detail: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const accessProfile = buildSessionAccessProfile(session);
  if (!canManageAdminActions(session, accessProfile)) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { employee_code } = await req.json();
  const empCode = String(employee_code || "").trim().toUpperCase();
  if (!empCode) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  let employee = null;
  try {
    employee = await prisma.employee.findFirst({
      where: { employee_code: empCode },
      select: { id: true, employee_code: true },
    });
  } catch (err) {
    return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: err.message }, { status: 500 });
  }

  if (!employee) {
    return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });
  }

  try {
    await prisma.authEmployeeDevice.updateMany({
      where: { employee_id: employee.id },
      data: { is_active: false },
    });
  } catch (err) {
    return Response.json({ error: "RESET_DEVICE_FAILED", detail: err.message }, { status: 500 });
  }

  return Response.json({ success: true, employee_code: empCode });
}
