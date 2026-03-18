import { getSessionTokenFromRequest } from "~/lib/session-cookie.server";
import { normalizeLoginContext } from "~/lib/session-context";
import { getSupabaseServerClient } from "~/lib/supabase.server";

export async function validateSession(request: Request, context: unknown) {
  const token = await getSessionTokenFromRequest(request);
  if (!token) {
    return { session: null, error: "MISSING_SESSION_TOKEN", status: 401 };
  }

  const { supabaseServer } = getSupabaseServerClient(context);

  const { data, error: dbError } = await supabaseServer
    .from("sessions")
    .select("id, emp_id, role, expires_at, is_active, login_context")
    .eq("session_token", token)
    .eq("is_active", true)
    .maybeSingle();

  if (dbError) {
    console.error("validateSession DB error:", dbError.message);
    return { session: null, error: "SESSION_VALIDATION_FAILED", status: 500 };
  }

  if (!data) {
    return { session: null, error: "INVALID_SESSION", status: 401 };
  }

  if (new Date(data.expires_at) < new Date()) {
    await supabaseServer.from("sessions").update({ is_active: false }).eq("id", data.id);
    return { session: null, error: "SESSION_EXPIRED", status: 401 };
  }

  return {
    session: {
      id: data.id,
      emp_id: data.emp_id,
      role: data.role,
      login_context: normalizeLoginContext(data.login_context),
    },
    error: null,
    status: 200,
  };
}
