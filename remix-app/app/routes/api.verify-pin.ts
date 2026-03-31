import bcrypt from "bcryptjs";
import type { ActionFunctionArgs } from "react-router";
import { sessionTokenCookie } from "~/lib/session-cookie.server";
import { EMPLOYEE_PORTAL } from "~/lib/session-context";
import prisma from "~/lib/prisma.server";
import { getDeviceIdFromRequest } from "~/lib/device-cookie.server";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers || {}),
    },
  });
}

function createSessionToken(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const body = (await request.json()) as {
      emp_id?: string;
      pin?: string;
      password?: string;
    };

    const empId = String(body.emp_id || "").trim().toUpperCase();
    const rawPassword = String(body.password || body.pin || "").trim();

    // PIN and emp_id required
    if (!empId || !rawPassword) {
      return json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    let user;
    try {
      user = await prisma.loginUser.findFirst({
        where: { emp_id: empId },
        select: {
          emp_id: true,
          role: true,
          pin_hash: true,
          force_pin_change: true,
          temp_pin_expires_at: true,
        },
      });
    } catch (dbError) {
      console.error("verify-pin user query failed:", dbError);
      return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
    }

    if (!user) {
      return json({ error: "USER_NOT_FOUND" }, { status: 400 });
    }

    let emp;
    try {
      emp = await prisma.employee.findUnique({
        where: { employee_id: empId },
        select: { status: true },
      });
    } catch (dbError) {
      console.error("verify-pin employee query failed:", dbError);
      return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
    }

    if (!emp) {
      return json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });
    }

    if (emp.status !== "active") {
      return json({ error: "ACCOUNT_BLOCKED", reason: emp.status }, { status: 403 });
    }

    if (!user.pin_hash) {
      return json({ error: "PIN_NOT_SET" }, { status: 400 });
    }

    const validPassword = await bcrypt.compare(rawPassword, user.pin_hash);
    if (!validPassword) {
      return json({ error: "INVALID_PIN" }, { status: 400 });
    }

    const mustChangePassword = Boolean(user.force_pin_change);
    if (mustChangePassword && user.temp_pin_expires_at && new Date(user.temp_pin_expires_at) < new Date()) {
      return json({ error: "TEMP_PIN_EXPIRED" }, { status: 400 });
    }

    const deviceId = await getDeviceIdFromRequest(request);
    if (!deviceId) {
      return json({ error: "MISSING_DEVICE_ID" }, { status: 401 });
    }

    const sessionToken = createSessionToken(32);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    try {
      await prisma.authSession.create({
        data: {
          session_token: sessionToken,
          emp_id: empId,
          role: user.role,
          device_id: deviceId,
          expires_at: expiresAt,
          is_active: true,
          login_context: EMPLOYEE_PORTAL,
          user_agent: request.headers.get("user-agent") ?? null,
        },
      });
    } catch (dbError) {
      console.error("verify-pin session insert failed:", dbError);
      return json({ error: "SESSION_CREATE_FAILED" }, { status: 500 });
    }

    return json(
      {
        success: true,
        emp_id: empId,
        role: user.role,
        status: emp.status,
        session_token: sessionToken,
        login_context: EMPLOYEE_PORTAL,
        must_change_pin: mustChangePassword,
        must_change_password: mustChangePassword,
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
  } catch (error) {
    return json({ error: "VERIFY_PIN_FAILED", detail: String((error as Error)?.message || error) }, { status: 500 });
  }
}
