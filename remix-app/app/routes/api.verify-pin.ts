import bcrypt from "bcryptjs";
import type { ActionFunctionArgs } from "react-router";
import { sessionTokenCookie } from "~/lib/session-cookie.server";
import { EMPLOYEE_PORTAL } from "~/lib/session-context";
import { getSupabaseServerClient } from "~/lib/supabase.server";
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

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const body = (await request.json()) as {
      emp_id?: string;
      pin?: string;
      password?: string;
      line_user_id?: string;
      id_token?: string;
    };

    const empId = String(body.emp_id || "").trim().toUpperCase();
    const rawPassword = String(body.password || body.pin || "").trim();
    const lineUserId = String(body.line_user_id || "").trim();
    const idToken = String(body.id_token || "").trim();

    // PIN and emp_id required; LINE fields optional (LIFF removed)
    if (!empId || !rawPassword) {
      return json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const { supabaseServer } = getSupabaseServerClient(context);

    const { data: user, error: userError } = await supabaseServer
      .from("login_users")
      .select("emp_id, role, pin_hash, force_pin_change, temp_pin_expires_at, line_user_id")
      .eq("emp_id", empId)
      .maybeSingle();

    if (userError) {
      console.error("verify-pin user query failed:", userError.message);
      return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
    }

    if (!user) {
      return json({ error: "USER_NOT_FOUND" }, { status: 400 });
    }

    const { data: emp, error: empError } = await supabaseServer
      .from("employees")
      .select("status")
      .eq("employee_code", empId)
      .maybeSingle();

    if (empError) {
      console.error("verify-pin employee query failed:", empError.message);
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

    // Check if LINE is being linked and validate conflict (optional, since LIFF removed)
    if (lineUserId) {
      const { data: linkedOtherUser, error: linkedOtherUserError } = await supabaseServer
        .from("login_users")
        .select("emp_id")
        .eq("line_user_id", lineUserId)
        .neq("emp_id", empId)
        .maybeSingle();

      if (linkedOtherUserError) {
        console.error("verify-pin line_user_id conflict query failed:", linkedOtherUserError.message);
        return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
      }

      if (linkedOtherUser) {
        return json({ error: "LINE_ALREADY_LINKED" }, { status: 409 });
      }

      // Only link LINE if provided (LIFF removed, optional now)
      const { error: linkError } = await supabaseServer
        .from("login_users")
        .update({ line_user_id: lineUserId })
        .eq("emp_id", empId);

      if (linkError) {
        console.error("verify-pin line link update failed:", linkError.message);
        return json({ error: "LINK_LINE_FAILED" }, { status: 500 });
      }
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
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS).toISOString();

    const { error: sessionError } = await supabaseServer.from("sessions").insert({
      session_token: sessionToken,
      emp_id: empId,
      role: user.role,
      device_id: deviceId,
      expires_at: expiresAt,
      is_active: true,
      login_context: EMPLOYEE_PORTAL,
      user_agent: request.headers.get("user-agent") || null,
    });

    if (sessionError) {
      console.error("verify-pin session insert failed:", sessionError.message);
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


