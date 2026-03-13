import { supabaseServer } from "@/lib/supabaseServer";
import { validateSession } from "@/lib/validateSession";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";

export async function GET(req) {
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

  let query = supabaseServer
    .from("pin_reset_audit")
    .select("id, target_emp_id, reset_by_emp_id, reset_by_role, ip_address, user_agent, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (empId) {
    query = query.eq("target_emp_id", empId);
  }

  const { data, error } = await query;
  if (error) {
    console.error("pin-reset-audit query failed:", error.message);
    return Response.json({ error: "DB_QUERY_FAILED", detail: error.message }, { status: 500 });
  }

  return Response.json({ success: true, rows: data || [] });
}
