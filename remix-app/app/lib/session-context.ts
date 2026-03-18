export const EMPLOYEE_PORTAL = "employee_portal";
export const ADMIN_PORTAL = "admin_portal";

export function normalizeLoginContext(value: unknown): string {
  const context = String(value || "").trim().toLowerCase();
  if (context === ADMIN_PORTAL) return ADMIN_PORTAL;
  return EMPLOYEE_PORTAL;
}
