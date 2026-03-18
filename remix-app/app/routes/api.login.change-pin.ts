import bcrypt from "bcryptjs";
import type { ActionFunctionArgs } from "react-router";
import { validateSession } from "~/lib/session-validation.server";
import { getSupabaseServerClient } from "~/lib/supabase.server";

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers || {}),
    },
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { session, error: authError, status: authStatus } = await validateSession(request, context);
  if (authError || !session) {
    return json({ error: authError || "UNAUTHORIZED" }, { status: authStatus || 401 });
  }

  const body = (await request.json()) as { new_pin?: string };
  const rawPin = String(body.new_pin || "").trim();

  if (!rawPin || rawPin.length < 4) {
    return json({ error: "PIN_TOO_SHORT" }, { status: 400 });
  }

  const { supabaseServer } = getSupabaseServerClient(context);

  const { data: user, error: userError } = await supabaseServer
    .from("login_users")
    .select("emp_id, force_pin_change, temp_pin_expires_at")
    .eq("emp_id", session.emp_id)
    .maybeSingle();

  if (userError) {
    console.error("change-pin login_users query failed:", userError.message);
    return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  if (!user) {
    return json({ error: "USER_NOT_FOUND" }, { status: 400 });
  }

  if (!user.force_pin_change) {
    return json({ error: "PIN_CHANGE_NOT_REQUIRED" }, { status: 400 });
  }

  if (user.temp_pin_expires_at && new Date(user.temp_pin_expires_at) < new Date()) {
    return json({ error: "TEMP_PIN_EXPIRED" }, { status: 400 });
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
    return json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  return json({ success: true }, { status: 200 });
}


