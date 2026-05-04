import { redirectToAdminLogin } from "~/lib/admin-login-redirect.server";
import { canAccessAdminPath, canAccessAdminPortal } from "~/lib/role-access.server";
import { validateSession } from "~/lib/session-validation.server";

export async function requireAdminSession(request: Request, context: unknown) {
  const { session, error, status } = await validateSession(request, context);
  if (error || !session) {
    if ((status ?? 500) >= 500) {
      throw new Response(error || "SESSION_VALIDATION_FAILED", { status: status || 500 });
    }
    throw redirectToAdminLogin(request);
  }

  const pathname = new URL(request.url).pathname;
  const isAdmin = canAccessAdminPortal(session.role, session.login_context);

  if (!isAdmin) {
    throw new Response("FORBIDDEN", { status: 403 });
  }

  if (!canAccessAdminPath(session.role, pathname, session.login_context)) {
    throw new Response("FORBIDDEN", { status: 403 });
  }

  return {
    emp_id: session.emp_id,
    role: session.role,
  };
}
