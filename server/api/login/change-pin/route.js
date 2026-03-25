import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { validateSession } from "@/lib/validateSession";

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const { new_pin } = await req.json();
  const rawPin = String(new_pin || "").trim();

  if (!rawPin || rawPin.length < 4) {
    return Response.json({ error: "PIN_TOO_SHORT" }, { status: 400 });
  }

  let user;
  try {
    user = await prisma.loginUser.findFirst({
      where: { emp_id: session.emp_id },
      select: { emp_id: true, force_pin_change: true, temp_pin_expires_at: true },
    });
  } catch (err) {
    console.error("change-pin login_users query failed:", err.message);
    return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  if (!user) {
    return Response.json({ error: "USER_NOT_FOUND" }, { status: 400 });
  }

  if (!user.force_pin_change) {
    return Response.json({ error: "PIN_CHANGE_NOT_REQUIRED" }, { status: 400 });
  }

  if (user.temp_pin_expires_at && new Date(user.temp_pin_expires_at) < new Date()) {
    return Response.json({ error: "TEMP_PIN_EXPIRED" }, { status: 400 });
  }

  const pinHash = await bcrypt.hash(rawPin, 10);

  // Update login_users including fields not yet in the Prisma schema
  // (is_registered, temp_pin_issued_at, temp_pin_issued_by). Raw SQL is used
  // so that all columns are written atomically.
  try {
    await prisma.$executeRaw`
      UPDATE login_users SET
        pin_hash            = ${pinHash},
        force_pin_change    = false,
        temp_pin_expires_at = NULL,
        temp_pin_issued_at  = NULL,
        temp_pin_issued_by  = NULL,
        is_registered       = true,
        updated_at          = NOW()
      WHERE emp_id = ${session.emp_id}
    `;
  } catch (err) {
    console.error("change-pin update failed:", err.message);
    return Response.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  return Response.json({ success: true });
}
