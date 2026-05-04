import { redirectToAdminLogin } from "~/lib/admin-login-redirect.server";
import { getConnectionString, withPgClient } from "~/lib/pg.server";
import { canAccessAdminPath } from "~/lib/role-access.server";
import { validateSession } from "~/lib/session-validation.server";
import { canReviewAllRequests, normalizeRoleKey } from "~/lib/request-types";

export type RequestAdminSession = {
  emp_id: string;
  role: string | null;
  roleKey: string;
  login_context: string | null;
  departmentId: number | null;
  canReviewAll: boolean;
  currentUser: {
    employeeId: string;
    departmentId: number | null;
  };
};

export async function requireRequestAdminSession(request: Request, context: unknown): Promise<RequestAdminSession> {
  const { session, error, status } = await validateSession(request, context);
  if (error || !session) {
    if ((status ?? 500) >= 500) {
      throw new Response(error || "SESSION_VALIDATION_FAILED", { status: status || 500 });
    }
    throw redirectToAdminLogin(request);
  }

  const pathname = new URL(request.url).pathname;
  if (!canAccessAdminPath(session.role, pathname, session.login_context)) {
    throw new Response("FORBIDDEN", { status: 403 });
  }

  const connectionString = getConnectionString(context);
  if (!connectionString) {
    throw new Response("CURRENT_USER_QUERY_FAILED", { status: 500 });
  }

  let currentUser: { employee_id: string; department_id: number | null } | null = null;
  try {
    currentUser = await withPgClient(connectionString, async (client) => {
      const result = await client.query<{ employee_id: string; department_id: number | null }>(
        `SELECT employee_id, department_id
         FROM employees
         WHERE employee_id = $1
         LIMIT 1`,
        [session.emp_id],
      );
      return result.rows[0] || null;
    });
  } catch (error) {
    console.error("requireRequestAdminSession currentUser query failed:", error);
    throw new Response("CURRENT_USER_QUERY_FAILED", { status: 500 });
  }

  if (!currentUser) {
    throw new Response("CURRENT_USER_NOT_FOUND", { status: 404 });
  }

  return {
    emp_id: session.emp_id,
    role: session.role,
    roleKey: normalizeRoleKey(session.role),
    login_context: session.login_context,
    departmentId: currentUser.department_id ?? null,
    canReviewAll: canReviewAllRequests(session.role, session.login_context),
    currentUser: {
      employeeId: currentUser.employee_id,
      departmentId: currentUser.department_id ?? null,
    },
  };
}
