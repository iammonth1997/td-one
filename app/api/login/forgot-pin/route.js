import { isServiceRoleEnabled, supabaseServer } from "@/lib/supabaseServer";
import crypto from "crypto";
import { checkRateLimit, recordLoginAttempt, clearFailedAttempts } from "@/lib/checkRateLimit";
import { validateSession } from "@/lib/validateSession";

const SECRET = process.env.RESET_PIN_SECRET || "td-one-reset-pin-secret-2026";
const TOKEN_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes
const RESET_ALLOWED_ROLES = new Set(["hr_payroll", "hr-payroll", "hr payroll", "hrpayroll"]);

function canResetPin(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return RESET_ALLOWED_ROLES.has(normalized);
}

function generateResetToken(empId, issuedByEmpId) {
  const payload = {
    emp_id: empId,
    issued_by: issuedByEmpId,
    exp: Date.now() + TOKEN_EXPIRY_MS,
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto.createHmac("sha256", SECRET).update(payloadStr).digest("base64url");
  return `${payloadStr}.${signature}`;
}

export async function POST(req) {
  if (!isServiceRoleEnabled) {
    return Response.json(
      { error: "SERVER_CONFIG_MISSING", message: "SUPABASE_SERVICE_ROLE_KEY is required" },
      { status: 500 }
    );
  }

  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  if (!canResetPin(session.role)) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { emp_id, start_month, start_year, date_of_birth } = await req.json();
  const empId = String(emp_id || "").trim().toUpperCase();
  const startMonth = Number(start_month);
  const startYear = Number(start_year);
  const dob = String(date_of_birth || "").trim();

  if (!empId || !startMonth || !startYear || !dob) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  if (startMonth < 1 || startMonth > 12) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  // Rate limiting
  const { locked, minutesRemaining } = await checkRateLimit(empId);
  if (locked) {
    return Response.json(
      { error: "ACCOUNT_LOCKED", minutesRemaining },
      { status: 429 }
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;

  const { data: emp, error: empQueryError } = await supabaseServer
    .from("employees")
    .select("date_of_birth, start_date, status")
    .eq("employee_code", empId)
    .maybeSingle();

  if (empQueryError) {
    console.error("forgot-pin employees query failed:", empQueryError.message);
    return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  if (!emp) {
    return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });
  }

  if (emp.status !== "active") {
    return Response.json({ error: "ACCOUNT_BLOCKED", reason: emp.status }, { status: 403 });
  }

  // Verify date of birth
  const employeeDob = String(emp.date_of_birth || "").slice(0, 10);
  if (employeeDob !== dob) {
    await recordLoginAttempt(empId, false, ip);
    return Response.json({ error: "INVALID_DOB" }, { status: 400 });
  }

  // Verify start date (month and year)
  const empStartDate = emp.start_date ? new Date(emp.start_date) : null;
  if (!empStartDate) {
    return Response.json({ error: "START_DATE_NOT_FOUND" }, { status: 400 });
  }

  const empStartMonth = empStartDate.getMonth() + 1; // getMonth() is 0-based
  const empStartYear = empStartDate.getFullYear();

  if (empStartMonth !== startMonth || empStartYear !== startYear) {
    await recordLoginAttempt(empId, false, ip);
    return Response.json({ error: "INVALID_START_DATE" }, { status: 400 });
  }

  // Check if user has a login record
  const { data: user } = await supabaseServer
    .from("login_users")
    .select("emp_id")
    .eq("emp_id", empId)
    .maybeSingle();

  if (!user) {
    return Response.json({ error: "USER_NOT_REGISTERED" }, { status: 400 });
  }

  // All checks passed — generate reset token
  const token = generateResetToken(empId, session.emp_id);

  await clearFailedAttempts(empId);
  return Response.json({ success: true, token });
}
