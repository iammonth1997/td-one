import { validateSession } from "@/lib/validateSession";
import { supabaseServer } from "@/lib/supabaseServer";
import { getEmployeeByEmpCode } from "@/lib/otRequestUtils";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";

// Helper to hash salary token
async function hashToken(token) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Helper to validate salary session token
async function validateSalaryToken(req) {
  const authHeader = req.headers.get("x-salary-token");
  if (!authHeader) {
    return { emp_id: null, error: null }; // Not required, fall back to session
  }

  const rawToken = authHeader.startsWith("SalaryToken ") ? authHeader.slice(12).trim() : authHeader;
  if (!rawToken) {
    return { emp_id: null, error: "INVALID_SALARY_TOKEN_FORMAT" };
  }

  const tokenHash = await hashToken(rawToken);
  const { data, error: dbErr } = await supabaseServer
    .from("salary_sessions")
    .select("emp_id, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (dbErr) {
    console.error("validateSalaryToken DB error:", dbErr.message);
    return { emp_id: null, error: "SESSION_VALIDATION_FAILED" };
  }

  if (!data) {
    return { emp_id: null, error: "INVALID_SALARY_TOKEN" };
  }

  if (new Date(data.expires_at) < new Date()) {
    await supabaseServer.from("salary_sessions").delete().eq("token_hash", tokenHash);
    return { emp_id: null, error: "SALARY_TOKEN_EXPIRED" };
  }

  return { emp_id: data.emp_id, error: null };
}

export async function GET(req) {
  // Check for salary-specific token first
  const { emp_id: salaryEmpId, error: salaryTokenError } = await validateSalaryToken(req);
  if (salaryTokenError) {
    return Response.json({ error: salaryTokenError }, { status: 401 });
  }

  // If salary token was provided, use that emp_id; otherwise use session
  let empId = salaryEmpId;

  if (!empId) {
    // Fall back to main session
    const { session, error: authError, status: authStatus } = await validateSession(req);
    if (authError) return Response.json({ error: authError }, { status: authStatus });

    const accessProfile = buildSessionAccessProfile(session);
    if (!hasAnyPermission(accessProfile, ["payroll.read.self", "payroll.read.full", "payroll.read.summary", "rbac.manage"])) {
      return Response.json({ error: "FORBIDDEN" }, { status: 403 });
    }

    empId = session.emp_id;
  }

  const { employee, error: employeeError } = await getEmployeeByEmpCode(empId);
  if (employeeError) return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
  if (!employee) return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get("year") || new Date().getFullYear());
  const month = Number(searchParams.get("month") || new Date().getMonth() + 1);

  const { data: slip, error } = await supabaseServer
    .from("salary_slips")
    .select("*")
    .eq("employee_id", employee.id)
    .eq("year", year)
    .eq("month", month)
    .maybeSingle();

  if (error) {
    return Response.json({ error: "SALARY_SLIP_QUERY_FAILED", detail: error.message }, { status: 500 });
  }

  // Set Cache-Control for salary slip responses
  return Response.json(
    {
      success: true,
      slip: slip || null,
      employee: {
        id: employee.id,
        name: employee.name,
        employee_code: employee.employee_code,
      },
      period: { year, month },
    },
    {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    }
  );
}
