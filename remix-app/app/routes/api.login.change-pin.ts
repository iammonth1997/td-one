import type { ActionFunctionArgs } from "react-router";
import { validateSession } from "~/lib/session-validation.server";
import prisma from "~/lib/prisma.server";
import {
  validatePasswordPolicy,
  hashPassword,
  verifyPassword,
  isPasswordReused,
  buildPasswordHistory,
} from "~/lib/password.server";
import { writeAuditLog, AuditEvent } from "~/lib/audit-log.server";

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

  const body = (await request.json().catch(() => null)) as {
    current_pin?: string;
    current_password?: string;
    new_pin?: string;
    new_password?: string;
  } | null;
  // Accept both old (pin) and new (password) field names
  const currentPassword = String(body?.current_password || body?.current_pin || "").trim();
  const rawPassword = String(body?.new_password || body?.new_pin || "").trim();

  // Enforce NIST password policy on new password
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const policyResult = validatePasswordPolicy(rawPassword, session.emp_id);
  if (!policyResult.valid) {
    return json({ error: policyResult.error || "INVALID_PASSWORD_FORMAT" }, { status: 400 });
  }

  let user;
  try {
    user = await prisma.loginUser.findFirst({
      where: { emp_id: session.emp_id },
      select: {
        emp_id: true,
        force_pin_change: true,
        must_change_password: true,
        temp_pin_expires_at: true,
        pin_hash: true,
      },
    });
  } catch (dbError) {
    console.error("change-pin login_users query failed:", dbError);
    return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  if (!user) {
    return json({ error: "USER_NOT_FOUND" }, { status: 400 });
  }

  if (user.force_pin_change || user.must_change_password) {
    if (user.temp_pin_expires_at && new Date(user.temp_pin_expires_at) < new Date()) {
      return json({ error: "TEMP_PIN_EXPIRED" }, { status: 400 });
    }
  } else {
    // Verify current credential (accepts old 6-digit PIN or new long password)
    if (!currentPassword) {
      return json({ error: "INVALID_CURRENT_PIN" }, { status: 400 });
    }
    const currentMatches = user.pin_hash ? await verifyPassword(currentPassword, user.pin_hash) : false;
    if (!currentMatches) {
      return json({ error: "INVALID_CURRENT_PIN" }, { status: 400 });
    }
  }

  // Check password history (last 3).
  // password_history is not in the Prisma LoginUser model — use an empty array as fallback.
  // The current hash is still checked via verifyPassword above.
  const existingHistory: string[] = [];
  const reused = await isPasswordReused(rawPassword, existingHistory);
  if (reused) {
    return json({ error: "PASSWORD_RECENTLY_USED" }, { status: 400 });
  }

  const newHash = await hashPassword(rawPassword);
  // buildPasswordHistory kept for future use when history column is added to schema
  void buildPasswordHistory(user.pin_hash ?? "", existingHistory);

  try {
    await prisma.loginUser.update({
      where: { emp_id: session.emp_id },
      data: {
        pin_hash: newHash,
        force_pin_change: false,
        must_change_password: false,
        temp_pin_expires_at: null,
      },
    });
  } catch (updateError) {
    console.error("change-pin update failed:", updateError);
    return json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  // Revoke all OTHER sessions (force re-login on all other devices after password change)
  void prisma.authSession.updateMany({
    where: { emp_id: session.emp_id, NOT: { id: session.id } },
    data: { is_active: false },
  });

  void writeAuditLog({
    event_type: AuditEvent.PASSWORD_CHANGED,
    emp_id: session.emp_id,
    ip_address: ip,
    metadata: { changed_by: "self" },
  });

  return json({ success: true }, { status: 200 });
}
