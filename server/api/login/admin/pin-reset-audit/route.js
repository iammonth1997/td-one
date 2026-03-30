import { getPrisma } from "@/lib/prisma";
import { validateSession } from "@/lib/validateSession";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";

export async function GET(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const accessProfile = buildSessionAccessProfile(session);

  if (!hasAnyPermission(accessProfile, ["audit.read.pin_reset", "audit.read.all", "rbac.manage"])) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const empId = String(searchParams.get("emp_id") || "").trim().toUpperCase();
  const limit = Math.min(Math.max(Number(searchParams.get("limit") || 100), 1), 200);

  // pin_reset_audit table is not yet in the Prisma schema; use raw SQL
  let data;
  try {
    if (empId) {
      data = await prisma.$queryRaw`
        SELECT id, target_emp_id, reset_by_emp_id, reset_by_role, ip_address, user_agent, created_at
        FROM pin_reset_audit
        WHERE target_emp_id = ${empId}
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    } else {
      data = await prisma.$queryRaw`
        SELECT id, target_emp_id, reset_by_emp_id, reset_by_role, ip_address, user_agent, created_at
        FROM pin_reset_audit
        ORDER BY created_at DESC
        LIMIT ${limit}
      `;
    }
  } catch (err) {
    console.error("pin-reset-audit query failed:", err.message);
    return Response.json({ error: "DB_QUERY_FAILED", detail: err.message }, { status: 500 });
  }

  return Response.json({ success: true, rows: data || [] });
}
