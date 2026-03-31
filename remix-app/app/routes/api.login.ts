import bcrypt from "bcryptjs";
import type { ActionFunctionArgs } from "react-router";
import { findEmployeeAuthRecord, isEmployeeAccountActive } from "~/lib/employee-auth.server";
import { clearFailedAttempts, checkRateLimit, recordLoginAttempt } from "~/lib/rate-limit.server";
import { sessionTokenCookie } from "~/lib/session-cookie.server";
import { EMPLOYEE_PORTAL } from "~/lib/session-context";
import { writeAuditLog, AuditEvent } from "~/lib/audit-log.server";
import { deviceIdCookie, getDeviceIdFromRequest } from "~/lib/device-cookie.server";
import { getConnectionString, withPgClient } from "~/lib/pg.server";

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

    const { locked, minutesRemaining } = await checkRateLimit(empId, context);
    stamp("rate_limit_checked");

    if (locked) {
      logTiming("ACCOUNT_LOCKED");
      return json({ error: "ACCOUNT_LOCKED", minutes_remaining: minutesRemaining }, { status: 429 });
    }

    const connectionString = getConnectionString(context);
    if (!connectionString) {
      logTiming("DB_QUERY_FAILED");
      return json({ error: "LOGIN_SERVICE_UNAVAILABLE", diagnostic: "NO_DATABASE_URL" }, { status: 503 });
    }

    const [user, emp] = await Promise.all([
      withPgClient(
        connectionString,
        async (client) => {
          const result = await client.query<{
            emp_id: string;
            role: string | null;
            pin_hash: string | null;
            force_pin_change: boolean | null;
            must_change_password: boolean | null;
            temp_pin_expires_at: string | Date | null;
          }>(
            `SELECT emp_id, role, pin_hash, force_pin_change, must_change_password, temp_pin_expires_at
             FROM login_users
             WHERE emp_id = $1
             LIMIT 1`,
            [empId],
          );
          stamp("login_user_loaded");
          return result.rows[0] || null;
        },
        1,
      ),
      findEmployeeAuthRecord(empId, context).then((record) => {
        stamp("employee_loaded");
        return record;
      }),
    ]);

    if (!user) {
      await recordLoginAttempt(empId, false, ipAddress, context);
      logTiming("USER_NOT_FOUND");
      return json({ error: "INVALID_CREDENTIALS" }, { status: 400 });
    }

    if (!emp) {
      await recordLoginAttempt(empId, false, ipAddress, context);
      logTiming("EMPLOYEE_NOT_FOUND");
      return json({ error: "INVALID_CREDENTIALS" }, { status: 400 });
    }

    if (!isEmployeeAccountActive(emp.status)) {
      logTiming("ACCOUNT_BLOCKED");
      return json({ error: "ACCOUNT_BLOCKED", reason: emp.status }, { status: 403 });
    }

    if (!user.pin_hash) {
      await recordLoginAttempt(empId, false, ipAddress, context);
      logTiming("PIN_NOT_SET");
      return json({ error: "INVALID_CREDENTIALS" }, { status: 400 });
    }

    const validPassword = await bcrypt.compare(rawPassword, user.pin_hash);
    stamp("password_compared");

    if (!validPassword) {
      await recordLoginAttempt(empId, false, ipAddress, context);
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
      stamp("device_lookup_done");
      stamp("device_count_checked");
      stamp("device_registered");
    }

    const sessionToken = createSessionToken(32);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    const userAgent = request.headers.get("user-agent") || null;

    await Promise.all([
      withPgClient(
        connectionString,
        async (client) => {
          await client.query(
            `INSERT INTO auth_sessions (
                id,
                session_token,
                emp_id,
                role,
                device_id,
                expires_at,
                is_active,
                login_context,
                ip_address,
                user_agent
              ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
            [
              crypto.randomUUID(),
              sessionToken,
              empId,
              user.role,
              resolvedDeviceId,
              expiresAt,
              true,
              EMPLOYEE_PORTAL,
              ipAddress,
              userAgent,
            ],
          );
        },
        1,
      ),
      recordLoginAttempt(empId, true, ipAddress, context),
      clearFailedAttempts(empId, context),
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
