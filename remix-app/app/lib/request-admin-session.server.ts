import { redirectToAdminLogin } from "~/lib/admin-login-redirect.server";
import prisma from "~/lib/prisma.server";
import { validateSession } from "~/lib/session-validation.server";
import { canAccessRequestAdmin, canReviewAllRequests, normalizeRoleKey } from "~/lib/request-types";

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

  if (!canAccessRequestAdmin(session.role, session.login_context)) {
    throw new Response("FORBIDDEN", { status: 403 });
  }

  const currentUser = await prisma.employee.findUnique({
    where: { employee_id: session.emp_id },
    select: {
      employee_id: true,
      department_id: true,
    },
  });

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
