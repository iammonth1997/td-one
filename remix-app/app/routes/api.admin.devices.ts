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
import { getPrisma } from "@/lib/prisma";
import { validateSession } from "~/lib/session-validation.server";
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

async function resolveEmployeeUuid(prisma: ReturnType<typeof getPrisma>, employeeCode: string) {
  const rows = await prisma.$queryRaw<Array<{ employee_uuid: string }>>`
    SELECT employee_uuid
    FROM employee_uuid_mappings
    WHERE employee_code = ${employeeCode}
    LIMIT 1
  `;
  return rows[0]?.employee_uuid || null;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const prisma = getPrisma(context.cloudflare?.env ?? {});
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

  const empRow = await prisma.employee.findUnique({
    where: { employee_id: targetEmpId.toUpperCase() },
    select: { employee_id: true },
  });

  if (!empRow) {
    return json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 404 });
  }

  const employeeUuid = await resolveEmployeeUuid(prisma, empRow.employee_id);
  if (!employeeUuid) {
    return json({ error: "EMPLOYEE_UUID_NOT_FOUND" }, { status: 409 });
  }

  let devices;
  try {
    devices = await prisma.authEmployeeDevice.findMany({
      where: { employee_id: employeeUuid },
      orderBy: { registered_at: "desc" },
      select: {
        id: true,
        device_id: true,
        device_name: true,
        platform: true,
        app_version: true,
        registered_at: true,
        last_active_at: true,
        is_active: true,
      },
    });
  } catch (dbErr) {
    console.error("admin/devices list error:", dbErr);
    return json({ error: "DB_QUERY_FAILED" }, { status: 500 });
  }

  return json({ devices: devices ?? [] });
}

export async function action({ request, context }: ActionFunctionArgs) {
  const prisma = getPrisma(context.cloudflare?.env ?? {});
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

  const ipAddress = request.headers.get("x-forwarded-for") || null;
  const targetEmpId = String(body.emp_id).toUpperCase();

  // Resolve employee UUID
  const empRow = await prisma.employee.findUnique({
    where: { employee_id: targetEmpId },
    select: { employee_id: true },
  });

  if (!empRow) {
    return json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 404 });
  }

  const employeeUuid = await resolveEmployeeUuid(prisma, empRow.employee_id);
  if (!employeeUuid) {
    return json({ error: "EMPLOYEE_UUID_NOT_FOUND" }, { status: 409 });
  }

  if (body.action === "deactivate") {
    // ─── Deactivate specific device ───────────────────────────────────────
    const deviceId = String(body.device_id || "").trim();
    if (!deviceId) {
      return json({ error: "device_id required" }, { status: 400 });
    }

    // a) Mark device inactive
    try {
      await prisma.authEmployeeDevice.updateMany({
        where: { employee_id: employeeUuid, device_id: deviceId },
        data: { is_active: false },
      });
    } catch (deviceErr) {
      console.error("admin/devices deactivate error:", deviceErr);
      return json({ error: "DB_UPDATE_FAILED" }, { status: 500 });
    }

    // b) Revoke all sessions tied to this device
    void prisma.authSession.updateMany({
      where: { emp_id: targetEmpId, device_id: deviceId },
      data: { is_active: false },
    });

    // c) Audit log
    void writeAuditLog({
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
    try {
      await prisma.authEmployeeDevice.updateMany({
        where: { employee_id: employeeUuid, is_active: true },
        data: { is_active: false },
      });
    } catch (devErr) {
      console.error("admin/devices deactivate_all error:", devErr);
      return json({ error: "DB_UPDATE_FAILED" }, { status: 500 });
    }

    // Revoke ALL sessions for this employee
    try {
      await prisma.authSession.updateMany({
        where: { emp_id: targetEmpId, is_active: true },
        data: { is_active: false },
      });
    } catch (sessErr) {
      console.error("admin/devices revoke all sessions error:", sessErr);
    }

    void writeAuditLog({
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
