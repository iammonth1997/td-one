/**
 * Admin Device Management — Remote Wipe
 *
 * POST /api/admin/devices
 * Actions (sent in body.action):
 *   - "deactivate"      — deactivate a single device + revoke its sessions
 *   - "deactivate_all"  — deactivate ALL devices for an employee (emergency wipe)
 *   - "list"            — list all registered devices for an employee (also via GET)
 *
 * Required role: admin | super_admin | hr_manager | hr_payroll
 * Every destructive action writes to security_audit_logs.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { validateSession } from "~/lib/session-validation.server";
import { getSupabaseServerClient } from "~/lib/supabase.server";
import { writeAuditLog, AuditEvent } from "~/lib/audit-log.server";

const ADMIN_ROLES = new Set(["admin", "super_admin", "hr_manager", "hr_payroll", "hr-payroll"]);

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init?.headers || {}),
    },
  });
}

function isAdminRole(role: unknown): boolean {
  return ADMIN_ROLES.has(String(role || "").toLowerCase());
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { session, error: authError, status: authStatus } = await validateSession(request, context);
  if (authError || !session) {
    return json({ error: authError || "UNAUTHORIZED" }, { status: authStatus || 401 });
  }
  if (!isAdminRole(session.role)) {
    return json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const url = new URL(request.url);
  const targetEmpId = url.searchParams.get("emp_id");
  if (!targetEmpId) {
    return json({ error: "emp_id query param required" }, { status: 400 });
  }

  const { supabaseServer } = getSupabaseServerClient(context);

  const { data: empRow } = await supabaseServer
    .from("employees")
    .select("id")
    .eq("employee_code", targetEmpId.toUpperCase())
    .maybeSingle();

  if (!empRow) {
    return json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 404 });
  }

  const { data: devices, error: dbErr } = await supabaseServer
    .from("employee_devices")
    .select("id, device_id, device_name, platform, app_version, registered_at, last_active_at, is_active, deactivated_at, deactivated_by")
    .eq("employee_id", empRow.id)
    .order("registered_at", { ascending: false });

  if (dbErr) {
    console.error("admin/devices list error:", dbErr.message);
    return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  return json({ devices: devices ?? [] });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const { session, error: authError, status: authStatus } = await validateSession(request, context);
  if (authError || !session) {
    return json({ error: authError || "UNAUTHORIZED" }, { status: authStatus || 401 });
  }
  if (!isAdminRole(session.role)) {
    return json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as {
    action?: string;
    emp_id?: string;
    device_id?: string;
    reason?: string;
  } | null;

  if (!body?.action || !body?.emp_id) {
    return json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const { supabaseServer } = getSupabaseServerClient(context);
  const ipAddress = request.headers.get("x-forwarded-for") || null;
  const targetEmpId = String(body.emp_id).toUpperCase();

  // Resolve employee UUID
  const { data: empRow } = await supabaseServer
    .from("employees")
    .select("id")
    .eq("employee_code", targetEmpId)
    .maybeSingle();

  if (!empRow) {
    return json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 404 });
  }

  const now = new Date().toISOString();

  if (body.action === "deactivate") {
    // ─── Deactivate specific device ───────────────────────────────────────
    const deviceId = String(body.device_id || "").trim();
    if (!deviceId) {
      return json({ error: "device_id required" }, { status: 400 });
    }

    // a) Mark device inactive
    const { error: deviceErr } = await supabaseServer
      .from("employee_devices")
      .update({
        is_active: false,
        deactivated_at: now,
        deactivated_by: session.emp_id,
      })
      .eq("employee_id", empRow.id)
      .eq("device_id", deviceId);

    if (deviceErr) {
      console.error("admin/devices deactivate error:", deviceErr.message);
      return json({ error: "DB_UPDATE_FAILED" }, { status: 500 });
    }

    // b) Revoke all sessions tied to this device
    void supabaseServer
      .from("sessions")
      .update({ is_active: false })
      .eq("emp_id", targetEmpId)
      .eq("device_id", deviceId);

    // c) Audit log
    void writeAuditLog(supabaseServer, {
      event_type: AuditEvent.DEVICE_DEACTIVATED,
      severity: "warning",
      emp_id: targetEmpId,
      device_id: deviceId,
      ip_address: ipAddress,
      metadata: {
        deactivated_by: session.emp_id,
        reason: body.reason ?? null,
      },
      is_alert: false,
    });

    return json({ success: true, action: "deactivate", device_id: deviceId });
  }

  if (body.action === "deactivate_all") {
    // ─── Emergency wipe: deactivate ALL devices ────────────────────────────
    const { error: devErr } = await supabaseServer
      .from("employee_devices")
      .update({
        is_active: false,
        deactivated_at: now,
        deactivated_by: session.emp_id,
      })
      .eq("employee_id", empRow.id)
      .eq("is_active", true);

    if (devErr) {
      console.error("admin/devices deactivate_all error:", devErr.message);
      return json({ error: "DB_UPDATE_FAILED" }, { status: 500 });
    }

    // Revoke ALL sessions for this employee
    const { error: sessErr } = await supabaseServer
      .from("sessions")
      .update({ is_active: false })
      .eq("emp_id", targetEmpId)
      .eq("is_active", true);

    if (sessErr) {
      console.error("admin/devices revoke all sessions error:", sessErr.message);
    }

    void writeAuditLog(supabaseServer, {
      event_type: AuditEvent.DEVICE_ALL_DEACTIVATED,
      severity: "critical",
      emp_id: targetEmpId,
      ip_address: ipAddress,
      metadata: {
        deactivated_by: session.emp_id,
        reason: body.reason ?? "emergency_wipe",
      },
      is_alert: true,
    });

    return json({ success: true, action: "deactivate_all" });
  }

  return json({ error: "UNKNOWN_ACTION" }, { status: 400 });
}
