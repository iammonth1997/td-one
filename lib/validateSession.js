import { supabaseServer } from "@/lib/supabaseServer";

/**
 * Validates a session token from the Authorization header.
 * @param {Request} req
 * @returns {Promise<{ session: object|null, error: string|null, status: number }>}
 */
export async function validateSession(req) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { session: null, error: "MISSING_SESSION_TOKEN", status: 401 };
  }

  const token = authHeader.slice(7);

  const { data, error: dbError } = await supabaseServer
    .from("sessions")
    .select("id, emp_id, role, expires_at, is_active")
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
    await supabaseServer
      .from("sessions")
      .update({ is_active: false })
      .eq("id", data.id);
    return { session: null, error: "SESSION_EXPIRED", status: 401 };
  }

  return {
    session: { id: data.id, emp_id: data.emp_id, role: data.role },
    error: null,
    status: 200,
  };
}
