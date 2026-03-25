import bcrypt from "bcryptjs";
import type { ActionFunctionArgs } from "react-router";
import { clearFailedAttempts, checkRateLimit, recordLoginAttempt } from "~/lib/rate-limit.server";
import { sessionTokenCookie } from "~/lib/session-cookie.server";
import { EMPLOYEE_PORTAL } from "~/lib/session-context";
import { writeAuditLog, AuditEvent } from "~/lib/audit-log.server";
import { deviceIdCookie, getDeviceIdFromRequest } from "~/lib/device-cookie.server";
import prisma from "~/lib/prisma.server";

const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_DEVICES_PER_EMPLOYEE = 2;

function createSessionToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
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

function getErrorCode(error: unknown) {
  const cause = (error as { cause?: unknown })?.cause as { code?: string } | undefined;
  const code = cause?.code || (error as { code?: string })?.code;
  return typeof code === "string" ? code : "UNKNOWN";
}

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const perfStart = performance.now();
    const checkpoints: Record<string, number> = {};
    const stamp = (label: string) => {
      checkpoints[label] = Number((performance.now() - perfStart).toFixed(1));
    };

    let empIdForLog: string | null = null;
    const logTiming = (outcome: string) => {
      console.info("[login][timing]", {
        emp_id: empIdForLog || "UNKNOWN",
        outcome,
        total_ms: Number((performance.now() - perfStart).toFixed(1)),
        checkpoints,
      });
    };

    const body = (await request.json().catch(() => null)) as {
      emp_id?: string;
      pin?: string;
      password?: string;
      device_id?: string;
      device_name?: string;
      platform?: string;
      app_version?: string;
    } | null;

    const empId = String(body?.emp_id || "").trim().toUpperCase();
    const rawPassword = String(body?.password || body?.pin || "").trim();
    let deviceId = String(body?.device_id || "").trim() || null;
    const deviceName = String(body?.device_name || "").trim() || null;
    const platform = (["android", "ios", "web"].includes(body?.platform ?? "")) ? body!.platform! : "web";
    const appVersion = String(body?.app_version || "").trim() || null;
    empIdForLog = empId;
    stamp("input_parsed");

    if (!empId || !rawPassword) {
      logTiming("INVALID_INPUT");
      return json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const ipAddress = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || null;

    if (!deviceId) {
      deviceId = (await getDeviceIdFromRequest(request)) || null;
    }

    const { locked, minutesRemaining } = await checkRateLimit(empId);
    stamp("rate_limit_checked");

    if (locked) {
      logTiming("ACCOUNT_LOCKED");
      return json({ error: "ACCOUNT_LOCKED", minutes_remaining: minutesRemaining }, { status: 429 });
    }

    const [user, emp] = await Promise.all([
      prisma.loginUser.findUnique({ where: { emp_id: empId } }).then((r) => { stamp("login_user_loaded"); return r; }),
      prisma.employee.findFirst({ where: { employee_code: empId }, select: { status: true } }).then((r) => { stamp("employee_loaded"); return r; }),
    ]);

    if (!user) {
      await recordLoginAttempt(empId, false, ipAddress);
      logTiming("USER_NOT_FOUND");
      return json({ error: "INVALID_CREDENTIALS" }, { status: 400 });
    }

    if (!emp) {
      await recordLoginAttempt(empId, false, ipAddress);
      logTiming("EMPLOYEE_NOT_FOUND");
      return json({ error: "INVALID_CREDENTIALS" }, { status: 400 });
    }

    if (emp.status !== "active") {
      logTiming("ACCOUNT_BLOCKED");
      return json({ error: "ACCOUNT_BLOCKED", reason: emp.status }, { status: 403 });
    }

    if (!user.pin_hash) {
      await recordLoginAttempt(empId, false, ipAddress);
      logTiming("PIN_NOT_SET");
      return json({ error: "INVALID_CREDENTIALS" }, { status: 400 });
    }

    const validPassword = await bcrypt.compare(rawPassword, user.pin_hash);
    stamp("password_compared");

    if (!validPassword) {
      await recordLoginAttempt(empId, false, ipAddress);
      stamp("failed_attempt_recorded");
      logTiming("INVALID_PIN");
      void writeAuditLog({
        event_type: AuditEvent.LOGIN_FAILED,
        severity: "warning",
        emp_id: empId,
        device_id: deviceId,
        ip_address: ipAddress,
        metadata: { reason: "INVALID_CREDENTIALS" },
      });
      return json({ error: "INVALID_CREDENTIALS" }, { status: 400 });
    }

    const mustChangePassword = Boolean(user.force_pin_change || user.must_change_password);
    if (mustChangePassword && user.temp_pin_expires_at && new Date(user.temp_pin_expires_at) < new Date()) {
      logTiming("TEMP_PIN_EXPIRED");
      return json({ error: "TEMP_PIN_EXPIRED" }, { status: 400 });
    }

    let resolvedDeviceId = deviceId;
    if (deviceId) {
      const empRow = await prisma.employee.findFirst({
        where: { employee_code: empId },
        select: { id: true },
      });
      stamp("employee_uuid_loaded");

      if (empRow?.id) {
        const existingDevice = await prisma.authEmployeeDevice.findFirst({
          where: { employee_id: empRow.id, device_id: deviceId },
          select: { id: true, is_active: true },
        });
        stamp("device_lookup_done");

        if (existingDevice) {
          if (!existingDevice.is_active) {
            logTiming("DEVICE_DEACTIVATED");
            void writeAuditLog({
              event_type: AuditEvent.UNREGISTERED_DEVICE_ATTEMPT,
              severity: "warning",
              emp_id: empId,
              device_id: deviceId,
              ip_address: ipAddress,
              metadata: { reason: "DEVICE_DEACTIVATED" },
            });
            return json({ error: "DEVICE_DEACTIVATED" }, { status: 403 });
          }
          await prisma.authEmployeeDevice.update({
            where: { id: existingDevice.id },
            data: { last_active_at: new Date() },
          });
        } else {
          const deviceCount = await prisma.authEmployeeDevice.count({
            where: { employee_id: empRow.id, is_active: true },
          });
          stamp("device_count_checked");

          if (deviceCount >= MAX_DEVICES_PER_EMPLOYEE) {
            logTiming("DEVICE_LIMIT_REACHED");
            void writeAuditLog({
              event_type: AuditEvent.DEVICE_LIMIT_REACHED,
              severity: "warning",
              emp_id: empId,
              device_id: deviceId,
              ip_address: ipAddress,
              metadata: { current_count: deviceCount, max: MAX_DEVICES_PER_EMPLOYEE },
            });
            return json(
              { error: "DEVICE_LIMIT_REACHED", message: "Maximum 2 devices allowed. Please deactivate an old device first." },
              { status: 403 }
            );
          }

          await prisma.authEmployeeDevice.create({
            data: {
              employee_id: empRow.id,
              device_id: deviceId,
              device_name: deviceName,
              platform,
              app_version: appVersion,
              is_active: true,
            },
          });
          stamp("device_registered");

          void writeAuditLog({
            event_type: AuditEvent.DEVICE_REGISTERED,
            emp_id: empId,
            device_id: deviceId,
            ip_address: ipAddress,
            metadata: { device_name: deviceName, platform, app_version: appVersion },
          });
        }
      }
    }

    const sessionToken = createSessionToken(32);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    await Promise.all([
      prisma.authSession.create({
        data: {
          session_token: sessionToken,
          emp_id: empId,
          role: user.role,
          expires_at: expiresAt,
          is_active: true,
          login_context: EMPLOYEE_PORTAL,
          ip_address: ipAddress,
          user_agent: request.headers.get("user-agent") || null,
          device_id: resolvedDeviceId,
        },
      }),
      recordLoginAttempt(empId, true, ipAddress),
      clearFailedAttempts(empId),
    ]);
    stamp("session_inserted");

    void writeAuditLog({
      event_type: AuditEvent.LOGIN_SUCCESS,
      emp_id: empId,
      device_id: resolvedDeviceId,
      ip_address: ipAddress,
      metadata: { role: user.role },
    });

    logTiming("SUCCESS");

    const isHttps = new URL(request.url).protocol === "https:";
    const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
    headers.append("Set-Cookie", await sessionTokenCookie.serialize(sessionToken, { secure: isHttps }));
    if (resolvedDeviceId) {
      headers.append("Set-Cookie", await deviceIdCookie.serialize(resolvedDeviceId, { secure: isHttps }));
    }

    return new Response(
      JSON.stringify({
        success: true,
        role: user.role,
        status: emp.status,
        login_context: EMPLOYEE_PORTAL,
        must_change_pin: mustChangePassword,
        must_change_password: mustChangePassword,
      }),
      { status: 200, headers }
    );
  } catch (error) {
    const diagnostic = getErrorCode(error);
    const message = error instanceof Error ? error.message : "Unknown login error";
    console.error("[login][unhandled]", { diagnostic, message, error });
    return json({ error: "LOGIN_SERVICE_UNAVAILABLE", diagnostic }, { status: 503 });
  }
}
