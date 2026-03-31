/**
 * Employee Onboarding — Activate Account
 *
 * POST /api/login/activate
 * Body: { emp_id: string, activation_code: string, password: string, device_id?: string, device_name?: string }
 * Returns: session cookie (same format as regular login)
 *
 * Flow:
 *  1. Employee enters emp_id + 8-digit activation code
 *  2. System validates code (not used, not expired, not invalidated)
 *  3. Employee sets initial NIST-compliant password (min 12 chars)
 *  4. First device auto-registered
 *  5. 30-day session created
 */

import type { ActionFunctionArgs } from "react-router";
import prisma from "~/lib/prisma.server";
import { validatePasswordPolicy, hashPassword } from "~/lib/password.server";
import { sessionTokenCookie } from "~/lib/session-cookie.server";
import { EMPLOYEE_PORTAL } from "~/lib/session-context";
import { writeAuditLog, AuditEvent } from "~/lib/audit-log.server";
import bcrypt from "bcryptjs";
import { getDeviceIdFromRequest } from "~/lib/device-cookie.server";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

function createSessionToken(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (v) => v.toString(16).padStart(2, "0")).join("");
}

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers || {}),
    },
  });
}

export async function action({ request }: ActionFunctionArgs) {
  const body = (await request.json().catch(() => null)) as {
    emp_id?: string;
    activation_code?: string;
    password?: string;
    device_id?: string;
    device_name?: string;
    platform?: string;
    app_version?: string;
  } | null;

  const empId = String(body?.emp_id || "").trim().toUpperCase();
  const activationCode = String(body?.activation_code || "").trim();
  const rawPassword = String(body?.password || "").trim();
  let deviceId = String(body?.device_id || "").trim() || null;
  const deviceName = String(body?.device_name || "").trim() || null;
  const platform = (["android", "ios", "web"].includes(body?.platform ?? "")) ? body!.platform! : "web";

  if (!empId || !activationCode || !rawPassword) {
    return json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const ipAddress = request.headers.get("x-forwarded-for") || null;
  if (!deviceId) {
    deviceId = (await getDeviceIdFromRequest(request)) || null;
  }

  // ─── Password policy check ────────────────────────────────────────────────
  const policyResult = validatePasswordPolicy(rawPassword, empId);
  if (!policyResult.valid) {
    return json({ error: policyResult.error || "INVALID_PASSWORD_FORMAT" }, { status: 400 });
  }

  // ─── Look up activation record ────────────────────────────────────────────
  // Prisma EmployeeActivation fields:
  //   code         = activation_code_hash (bcrypt hash of the plain code)
  //   used_at      = null means not used yet (replaces is_used = false)
  //   is_active    = true means not invalidated (replaces is_invalidated = false)
  let activation;
  try {
    activation = await prisma.employeeActivation.findFirst({
      where: { emp_id: empId, is_active: true, used_at: null },
      orderBy: { created_at: "desc" },
      select: { id: true, code: true, expires_at: true },
    });
  } catch (actErr) {
    console.error("activate: DB query error:", actErr);
    return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  if (!activation) {
    // No active code — return same error as wrong code (prevent user enumeration)
    return json({ error: "INVALID_ACTIVATION_CODE" }, { status: 400 });
  }

  if (activation.expires_at && new Date(activation.expires_at) < new Date()) {
    void prisma.employeeActivation.update({
      where: { id: activation.id },
      data: { is_active: false },
    });
    return json({ error: "ACTIVATION_CODE_EXPIRED" }, { status: 400 });
  }

  // ─── Verify code ──────────────────────────────────────────────────────────
  const codeValid = await bcrypt.compare(activationCode, activation.code);

  if (!codeValid) {
    void writeAuditLog({
      event_type: AuditEvent.ACTIVATION_CODE_FAILED,
      severity: "warning",
      emp_id: empId,
      ip_address: ipAddress,
    });
    return json({ error: "INVALID_ACTIVATION_CODE" }, { status: 400 });
  }

  // ─── Look up employee ─────────────────────────────────────────────────────
  const emp = await prisma.employee.findUnique({
    where: { employee_id: empId },
    select: { employee_id: true, status: true },
  });

  if (!emp || emp.status !== "active") {
    return json({ error: emp ? "ACCOUNT_BLOCKED" : "EMPLOYEE_NOT_FOUND" }, { status: 403 });
  }

  // ─── Set password ─────────────────────────────────────────────────────────
  const passwordHash = await hashPassword(rawPassword);

  try {
    await prisma.loginUser.upsert({
      where: { emp_id: empId },
      update: {
        pin_hash: passwordHash,
        force_pin_change: false,
        must_change_password: false,
      },
      create: {
        emp_id: empId,
        pin_hash: passwordHash,
        force_pin_change: false,
        must_change_password: false,
      },
    });
  } catch (upsertErr) {
    console.error("activate: upsert error:", upsertErr);
    return json({ error: "UPDATE_FAILED" }, { status: 500 });
  }

  // ─── Mark activation code as used ────────────────────────────────────────
  void prisma.employeeActivation.update({
    where: { id: activation.id },
    data: { used_at: new Date(), is_active: false },
  });

  // ─── Register device ──────────────────────────────────────────────────────
  if (deviceId) {
    void prisma.authEmployeeDevice.upsert({
      where: { employee_id_device_id: { employee_id: emp.employee_id, device_id: deviceId } },
      update: { last_active_at: new Date(), is_active: true },
      create: {
        employee_id: emp.employee_id,
        device_id: deviceId,
        device_name: deviceName,
        platform,
        last_active_at: new Date(),
        is_active: true,
      },
    });
  }

  // ─── Get default role ─────────────────────────────────────────────────────
  const loginUser = await prisma.loginUser.findFirst({
    where: { emp_id: empId },
    select: { role: true },
  });

  // ─── Create session ───────────────────────────────────────────────────────
  const sessionToken = createSessionToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  try {
    await prisma.authSession.create({
      data: {
        session_token: sessionToken,
        emp_id: empId,
        role: loginUser?.role ?? "employee",
        expires_at: expiresAt,
        is_active: true,
        login_context: EMPLOYEE_PORTAL,
        ip_address: ipAddress,
        device_id: deviceId,
        user_agent: request.headers.get("user-agent") ?? null,
      },
    });
  } catch (sessionErr) {
    console.error("activate: session insert error:", sessionErr);
    return json({ error: "SESSION_CREATE_FAILED" }, { status: 500 });
  }

  void writeAuditLog({
    event_type: AuditEvent.ACTIVATION_CODE_USED,
    emp_id: empId,
    device_id: deviceId,
    ip_address: ipAddress,
    metadata: { device_name: deviceName, platform },
  });

  return json(
    {
      success: true,
      role: loginUser?.role ?? "employee",
      login_context: EMPLOYEE_PORTAL,
    },
    {
      status: 200,
      headers: {
        "Set-Cookie": await sessionTokenCookie.serialize(sessionToken, {
          secure: new URL(request.url).protocol === "https:",
        }),
      },
    }
  );
}
