import { isServiceRoleEnabled, supabaseServer } from "@/lib/supabaseServer";
import bcrypt from "bcryptjs";

export async function POST(req) {
  if (!isServiceRoleEnabled) {
    return Response.json(
      { error: "SERVER_CONFIG_MISSING", message: "SUPABASE_SERVICE_ROLE_KEY is required" },
      { status: 500 }
    );
  }

  const { emp_id, pin, device_id } = await req.json();
  const empId = String(emp_id || "").trim().toUpperCase();
  const rawPin = String(pin || "").trim();

  if (!empId || !rawPin) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const { data: user, error: userQueryError } = await supabaseServer
    .from("login_users")
    .select("*")
    .eq("emp_id", empId)
    .maybeSingle();

  if (userQueryError) {
    console.error("login login_users query failed:", userQueryError.message);
    return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  if (!user) {
    return Response.json({ error: "USER_NOT_FOUND" }, { status: 400 });
  }

  const { data: emp, error: empQueryError } = await supabaseServer
    .from("employees")
    .select("status")
    .eq("employee_code", empId)
    .maybeSingle();

  if (empQueryError) {
    console.error("login employees query failed:", empQueryError.message);
    return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  if (!emp) {
    return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });
  }

  if (emp.status !== "active") {
    return Response.json(
      { error: "ACCOUNT_BLOCKED", reason: emp.status },
      { status: 403 }
    );
  }

  if (!user.pin_hash) {
    return Response.json(
      { error: "PIN_NOT_SET", message: "Please set your PIN first" },
      { status: 400 }
    );
  }

  const validPin = await bcrypt.compare(rawPin, user.pin_hash);
  if (!validPin) {
    return Response.json({ error: "INVALID_PIN" }, { status: 400 });
  }

  if (user.device_id_hash) {
    const validDevice = await bcrypt.compare(String(device_id || ""), user.device_id_hash);
    if (!validDevice) {
      return Response.json({ error: "DEVICE_NOT_ALLOWED" }, { status: 403 });
    }
  }

  return Response.json({
    success: true,
    role: user.role,
    status: emp.status,
  });
}
