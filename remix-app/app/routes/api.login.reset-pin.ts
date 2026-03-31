import type { ActionFunctionArgs } from "react-router";
import { verifyResetToken } from "~/lib/reset-token.server";
import { canManagePinReset } from "~/lib/role-access.server";
import { validateSession } from "~/lib/session-validation.server";
import prisma from "~/lib/prisma.server";
import { validatePasswordPolicy, hashPassword } from "~/lib/password.server";

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
  const { session, error: authError, status: authStatus } = await validateSession(request, context);
  if (authError || !session) {
    return json({ error: authError || "UNAUTHORIZED" }, { status: authStatus || 401 });
  }

  if (!canManagePinReset(session.role)) {
    return json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    token?: string;
    new_pin?: string;
    new_password?: string;
  } | null;
  const rawToken = String(body?.token || "").trim();
  const rawPassword = String(body?.new_password || body?.new_pin || "").trim();

  if (!rawToken || !rawPassword) {
    return json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const policyResult = validatePasswordPolicy(rawPassword);
  if (!policyResult.valid) {
    return json({ error: policyResult.error || "INVALID_PASSWORD_FORMAT" }, { status: 400 });
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

  const emp = await prisma.employee.findUnique({
    where: { employee_id: empId },
    select: { status: true },
  });

  if (!emp || emp.status !== "active") {
    return json({ error: "ACCOUNT_BLOCKED" }, { status: 403 });
  }

  const passwordHash = await hashPassword(rawPassword);

  try {
    await prisma.loginUser.update({
      where: { emp_id: empId },
      data: {
        pin_hash: passwordHash,
        force_pin_change: false,
        must_change_password: false,
        temp_pin_expires_at: null,
      },
    });
  } catch (updateError) {
    console.error("reset-pin update failed:", updateError);
    return json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  // Write pin reset audit record
  const ipAddress = getClientIp(request);
  const userAgent = request.headers.get("user-agent") || null;
  try {
    await prisma.$executeRaw`
      INSERT INTO pin_reset_audit (target_emp_id, reset_by_emp_id, reset_by_role, ip_address, user_agent)
      VALUES (${empId}, ${session.emp_id}, ${session.role}, ${ipAddress}, ${userAgent})
    `;
  } catch (auditError) {
    console.error("password reset audit insert failed:", auditError);
  }

  return json({ success: true }, { status: 200 });
}
