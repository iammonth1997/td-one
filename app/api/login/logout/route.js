import { supabaseServer } from "@/lib/supabaseServer";
import { validateSession } from "@/lib/validateSession";

export async function POST(req) {
  const { session, error, status } = await validateSession(req);
  if (error) {
    return Response.json({ error }, { status });
  }

  await supabaseServer
    .from("sessions")
    .update({ is_active: false })
    .eq("id", session.id);

  return Response.json({ success: true });
}
