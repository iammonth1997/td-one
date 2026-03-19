/**
 * Security Audit Log Service
 *
 * Append-only event log for all authentication, device, attendance, and salary events.
 * Events should NEVER be updated or deleted (regulatory requirement: retain 2 years).
 *
 * Alert triggers (is_alert = true):
 *  - 5+ consecutive login failures
 *  - Unregistered device attempt
 *  - Mock/fake GPS detected
 *  - Salary access outside business hours
 *  - Repeated out-of-bounds scan attempts
 */

import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Event Type Constants ────────────────────────────────────────────────────

export const AuditEvent = {
  // Authentication
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  SESSION_CREATED: "SESSION_CREATED",
  SESSION_EXPIRED: "SESSION_EXPIRED",
  SESSION_REVOKED: "SESSION_REVOKED",
  PASSWORD_CHANGED: "PASSWORD_CHANGED",
  PASSWORD_RESET: "PASSWORD_RESET",
  ACCOUNT_LOCKED: "ACCOUNT_LOCKED",
  ACCOUNT_UNLOCKED: "ACCOUNT_UNLOCKED",
  // Device
  DEVICE_REGISTERED: "DEVICE_REGISTERED",
  DEVICE_DEACTIVATED: "DEVICE_DEACTIVATED",
  DEVICE_ALL_DEACTIVATED: "DEVICE_ALL_DEACTIVATED",
  DEVICE_LIMIT_REACHED: "DEVICE_LIMIT_REACHED",
  UNREGISTERED_DEVICE_ATTEMPT: "UNREGISTERED_DEVICE_ATTEMPT",
  // Attendance
  CLOCK_IN: "CLOCK_IN",
  CLOCK_OUT: "CLOCK_OUT",
  SCAN_REJECTED_GPS: "SCAN_REJECTED_GPS",
  SCAN_REJECTED_DEVICE: "SCAN_REJECTED_DEVICE",
  MOCK_LOCATION_DETECTED: "MOCK_LOCATION_DETECTED",
  // Salary
  SALARY_AUTH_SUCCESS: "SALARY_AUTH_SUCCESS",
  SALARY_AUTH_FAILED: "SALARY_AUTH_FAILED",
  SALARY_DATA_ACCESSED: "SALARY_DATA_ACCESSED",
  SALARY_ACCESS_LOCKED: "SALARY_ACCESS_LOCKED",
  SALARY_OFFHOURS_ACCESS: "SALARY_OFFHOURS_ACCESS",
  // Onboarding
  ACTIVATION_CODE_USED: "ACTIVATION_CODE_USED",
  ACTIVATION_CODE_FAILED: "ACTIVATION_CODE_FAILED",
  ACTIVATION_CODE_INVALIDATED: "ACTIVATION_CODE_INVALIDATED",
} as const;

export type AuditEventType = (typeof AuditEvent)[keyof typeof AuditEvent];

type Severity = "info" | "warning" | "critical";

interface AuditLogEntry {
  event_type: AuditEventType;
  severity?: Severity;
  emp_id?: string | null;
  device_id?: string | null;
  ip_address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  metadata?: Record<string, unknown>;
  is_alert?: boolean;
}

/**
 * Write one event to security_audit_logs.
 * Fire-and-forget: errors are logged but never thrown to avoid
 * failing the primary operation because of a logging side-effect.
 */
export async function writeAuditLog(
  supabase: SupabaseClient,
  entry: AuditLogEntry
): Promise<void> {
  try {
    const { error } = await supabase.from("security_audit_logs").insert({
      event_type: entry.event_type,
      severity: entry.severity ?? "info",
      emp_id: entry.emp_id ?? null,
      device_id: entry.device_id ?? null,
      ip_address: entry.ip_address ?? null,
      latitude: entry.latitude ?? null,
      longitude: entry.longitude ?? null,
      metadata: entry.metadata ?? null,
      is_alert: entry.is_alert ?? false,
    });
    if (error) {
      console.error("[audit-log] insert error:", error.message);
    }
  } catch (err) {
    console.error("[audit-log] unexpected error:", err);
  }
}

/** Convenience: determine if salary access is outside business hours (07:00–20:00 local) */
export function isOutsideBusinessHours(): boolean {
  const bangkokHour = new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Bangkok" })
  ).getHours();
  return bangkokHour < 7 || bangkokHour >= 20;
}
