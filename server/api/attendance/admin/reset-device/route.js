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
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
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
    const rows = await prisma.$queryRaw`
      SELECT
        e.employee_id AS employee_code,
        m.employee_uuid AS employee_uuid
      FROM employees e
      LEFT JOIN employee_uuid_mappings m
        ON m.employee_code = e.employee_id
      WHERE UPPER(e.employee_id) = ${empCode}
      LIMIT 1
    `;
    const row = Array.isArray(rows) ? rows[0] : null;
    employee = row
      ? { id: row.employee_uuid || null, employee_code: row.employee_code || empCode }
      : null;
  } catch (err) {
    return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: err.message }, { status: 500 });
  }

  if (!employee || !employee.id) {
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
