import { getPrisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { checkRateLimit, recordLoginAttempt, clearFailedAttempts } from "@/lib/checkRateLimit";

export async function POST(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { emp_id, date_of_birth, pin } = await req.json();
  const empId = String(emp_id || "").trim().toUpperCase();
  const dob = String(date_of_birth || "").trim();
  const rawPin = String(pin || "").trim();

  if (!empId || !dob || !rawPin) {
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

  let emp;
  try {
    emp = await prisma.employee.findUnique({
      where: { employee_id: empId },
      select: { date_of_birth: true, status: true },
    });
  } catch (err) {
    console.error("set-pin employees query failed:", err.message);
    return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  if (!emp) {
    return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });
  }

  if (emp.status !== "active") {
    return Response.json({ error: "ACCOUNT_BLOCKED", reason: emp.status }, { status: 403 });
  }

  // date_of_birth is returned as a Date object by Prisma; convert to YYYY-MM-DD for comparison
  const employeeDob = emp.date_of_birth
    ? emp.date_of_birth.toISOString().slice(0, 10)
    : "";
  if (employeeDob !== dob) {
    await recordLoginAttempt(empId, false, ip);
    return Response.json({ error: "INVALID_DOB" }, { status: 400 });
  }

  const salt = await bcrypt.genSalt(10);
  const pin_hash = await bcrypt.hash(rawPin, salt);

  // Upsert login_users including fields not yet in the Prisma schema
  // (is_registered, temp_pin_issued_at, temp_pin_issued_by). Raw SQL is used
  // so that these columns are properly cleared on a repeated set-pin call.
  try {
    await prisma.$executeRaw`
      INSERT INTO login_users (emp_id, pin_hash, is_registered, force_pin_change, temp_pin_expires_at, temp_pin_issued_at, temp_pin_issued_by)
      VALUES (${empId}, ${pin_hash}, true, false, NULL, NULL, NULL)
      ON CONFLICT (emp_id) DO UPDATE SET
        pin_hash             = EXCLUDED.pin_hash,
        is_registered        = true,
        force_pin_change     = false,
        temp_pin_expires_at  = NULL,
        temp_pin_issued_at   = NULL,
        temp_pin_issued_by   = NULL,
        updated_at           = NOW()
    `;
  } catch (err) {
    console.error("set-pin login_users upsert failed:", err.message);
    return Response.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  await clearFailedAttempts(empId);
  return Response.json({ success: true });
}
