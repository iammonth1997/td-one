import { requireSession } from "~/lib/require-session.server";
import { canManagePinReset } from "~/lib/role-access.server";

export async function requireAdminSession(request: Request, context: unknown) {
  const session = await requireSession(request, context);
  const isAdmin = canManagePinReset(session.role) || session.login_context === "admin_portal";

  if (!isAdmin) {
    throw new Response("FORBIDDEN", { status: 403 });
  }

  return {
    emp_id: session.emp_id,
    role: session.role,
  };
}
