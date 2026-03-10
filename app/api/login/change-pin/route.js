import bcrypt from "bcryptjs";
import { supabaseServer } from "@/lib/supabaseServer";
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

  const { data: user, error: userError } = await supabaseServer
    .from("login_users")
    .select("emp_id, force_pin_change, temp_pin_expires_at")
    .eq("emp_id", session.emp_id)
    .maybeSingle();

  if (userError) {
    console.error("change-pin login_users query failed:", userError.message);
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
  const { error: updateError } = await supabaseServer
    .from("login_users")
    .update({
      pin_hash: pinHash,
      force_pin_change: false,
      temp_pin_expires_at: null,
      temp_pin_issued_at: null,
      temp_pin_issued_by: null,
      is_registered: true,
    })
    .eq("emp_id", session.emp_id);

  if (updateError) {
    console.error("change-pin update failed:", updateError.message);
    return Response.json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  return Response.json({ success: true });
}
