import { isServiceRoleEnabled, supabaseServer } from "@/lib/supabaseServer";
import bcrypt from "bcryptjs";

export async function POST(req) {
  if (!isServiceRoleEnabled) {
    return Response.json(
      { error: "SERVER_CONFIG_MISSING", message: "SUPABASE_SERVICE_ROLE_KEY is required" },
      { status: 500 }
    );
  }

  const { emp_id, date_of_birth, pin } = await req.json();
  const empId = String(emp_id || "").trim().toUpperCase();
  const dob = String(date_of_birth || "").trim();
  const rawPin = String(pin || "").trim();

  if (!empId || !dob || !rawPin) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const { data: emp, error: empQueryError } = await supabaseServer
    .from("employees")
    .select("date_of_birth")
    .eq("employee_code", empId)
    .maybeSingle();

  if (empQueryError) {
    console.error("set-pin employees query failed:", empQueryError.message);
    return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  if (!emp) {
    return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });
  }

  const employeeDob = String(emp.date_of_birth || "").slice(0, 10);
  if (employeeDob !== dob) {
    return Response.json({ error: "INVALID_DOB" }, { status: 400 });
  }

  const salt = await bcrypt.genSalt(10);
  const pin_hash = await bcrypt.hash(rawPin, salt);

  const { error: upsertError } = await supabaseServer
    .from("login_users")
    .upsert(
      { emp_id: empId, pin_hash, is_registered: true, date_of_birth: emp.date_of_birth },
      { onConflict: "emp_id" }
    )
    .select("emp_id");

  if (upsertError) {
    console.error("set-pin login_users upsert failed:", upsertError.message);
    return Response.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  return Response.json({ success: true });
}
