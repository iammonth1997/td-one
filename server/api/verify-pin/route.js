import bcrypt from "bcryptjs";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { EMPLOYEE_PORTAL } from "@/lib/sessionContext";

const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;

function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(";").map((s) => s.trim());
  for (const part of parts) {
    const [k, ...rest] = part.split("=");
    if (k === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export async function POST(req) {
  try {
    const { emp_id, pin, line_user_id, id_token } = await req.json();
    const empId = String(emp_id || "").trim().toUpperCase();
    const rawPin = String(pin || "").trim();
    const lineUserId = String(line_user_id || "").trim();

    // PIN and emp_id are required; LINE fields are optional (LIFF removed)
    if (!empId || !rawPin) {
      return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    // line_user_id is not in the Prisma schema (LIFF removed). Query all other
    // fields via the ORM; line_user_id will be undefined on the returned object.
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
    } catch (err) {
      console.error("verify-pin user query failed:", err.message);
      return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
    }

    if (!user) {
      return Response.json({ error: "USER_NOT_FOUND" }, { status: 400 });
    }

    let emp;
    try {
      emp = await prisma.employee.findFirst({
        where: { employee_code: empId },
        select: { status: true },
      });
    } catch (err) {
      console.error("verify-pin employee query failed:", err.message);
      return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
    }

    if (!emp) {
      return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });
    }

    if (emp.status !== "active") {
      return Response.json({ error: "ACCOUNT_BLOCKED", reason: emp.status }, { status: 403 });
    }

    if (!user.pin_hash) {
      return Response.json({ error: "PIN_NOT_SET" }, { status: 400 });
    }

    const validPin = await bcrypt.compare(rawPin, user.pin_hash);
    if (!validPin) {
      return Response.json({ error: "INVALID_PIN" }, { status: 400 });
    }

    // Check if LINE is being linked and validate conflict (optional, since LIFF removed).
    // line_user_id column is not in the Prisma schema; use raw SQL if a value is present.
    if (lineUserId) {
      let conflictRows;
      try {
        conflictRows = await prisma.$queryRaw`
          SELECT emp_id
          FROM login_users
          WHERE line_user_id = ${lineUserId}
            AND emp_id != ${empId}
          LIMIT 1
        `;
      } catch (err) {
        console.error("verify-pin line_user_id conflict query failed:", err.message);
        return Response.json({ error: "DB_QUERY_FAILED" }, { status: 500 });
      }

      if (conflictRows.length > 0) {
        return Response.json({ error: "LINE_ALREADY_LINKED" }, { status: 409 });
      }
    }

    const mustChangePin = Boolean(user.force_pin_change);
    if (mustChangePin && user.temp_pin_expires_at && new Date(user.temp_pin_expires_at) < new Date()) {
      return Response.json({ error: "TEMP_PIN_EXPIRED" }, { status: 400 });
    }

    const deviceId =
      getCookieValue(req.headers.get("cookie"), "tdone_device_id") || req.headers.get("x-device-id")?.trim();
    if (!deviceId) {
      return Response.json({ error: "MISSING_DEVICE_ID" }, { status: 401 });
    }

    const sessionToken = crypto.randomBytes(32).toString("hex");
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
          user_agent: req.headers.get("user-agent") || null,
        },
      });
    } catch (err) {
      console.error("verify-pin session insert failed:", err.message);
      return Response.json({ error: "SESSION_CREATE_FAILED" }, { status: 500 });
    }

    return Response.json({
      success: true,
      emp_id: empId,
      role: user.role,
      status: emp.status,
      session_token: sessionToken,
      login_context: EMPLOYEE_PORTAL,
      must_change_pin: mustChangePin,
    });
  } catch (error) {
    return Response.json({ error: "VERIFY_PIN_FAILED", detail: String(error.message || error) }, { status: 500 });
  }
}
