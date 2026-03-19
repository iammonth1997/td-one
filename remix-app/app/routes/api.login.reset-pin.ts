import bcrypt from "bcryptjs";
import type { ActionFunctionArgs } from "react-router";
import { verifyResetToken } from "~/lib/reset-token.server";
import { canManagePinReset } from "~/lib/role-access.server";
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

function getClientIp(request: Request) {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { isServiceRoleEnabled, supabaseServer } = getSupabaseServerClient(context);
  if (!isServiceRoleEnabled) {
    return json(
      { error: "SERVER_CONFIG_MISSING", message: "SUPABASE_SERVICE_ROLE_KEY is required" },
      { status: 500 }
    );
  }

  const { session, error: authError, status: authStatus } = await validateSession(request, context);
  if (authError || !session) {
    return json({ error: authError || "UNAUTHORIZED" }, { status: authStatus || 401 });
  }

  if (!canManagePinReset(session.role)) {
    return json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as { token?: string; new_pin?: string } | null;
  const rawToken = String(body?.token || "").trim();
  const rawPin = String(body?.new_pin || "").trim();

  if (!rawToken || !rawPin) {
    return json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  if (!/^\d{6}$/.test(rawPin)) {
    return json({ error: "INVALID_PIN_FORMAT" }, { status: 400 });
  }

  let payload: Awaited<ReturnType<typeof verifyResetToken>>;
  try {
    payload = await verifyResetToken(context, rawToken);
  } catch (error) {
    console.error("reset-pin token verification failed:", error);
    return json(
      { error: "SERVER_CONFIG_MISSING", message: "RESET_PIN_SECRET is required" },
      { status: 500 }
    );
  }

  if (!payload) {
    return json({ error: "INVALID_OR_EXPIRED_TOKEN" }, { status: 400 });
  }

  if (payload.issued_by && payload.issued_by !== session.emp_id) {
    return json({ error: "TOKEN_ISSUER_MISMATCH" }, { status: 403 });
  }

  const empId = payload.emp_id;

  const { data: emp } = await supabaseServer
    .from("employees")
    .select("status")
    .eq("employee_code", empId)
    .maybeSingle();

  if (!emp || emp.status !== "active") {
    return json({ error: "ACCOUNT_BLOCKED" }, { status: 403 });
  }

  const salt = await bcrypt.genSalt(10);
  const pinHash = await bcrypt.hash(rawPin, salt);

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
    .eq("emp_id", empId);

  if (updateError) {
    console.error("reset-pin update failed:", updateError.message);
    return json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  const ipAddress = getClientIp(request);
  const userAgent = request.headers.get("user-agent") || null;
  const { error: auditError } = await supabaseServer.from("pin_reset_audit").insert({
    target_emp_id: empId,
    reset_by_emp_id: session.emp_id,
    reset_by_role: session.role,
    ip_address: ipAddress,
    user_agent: userAgent,
  });

  if (auditError) {
    console.error("pin reset audit insert failed:", auditError.message);
  }

  return json({ success: true }, { status: 200 });
}


