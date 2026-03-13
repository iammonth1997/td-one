export const EMPLOYEE_PORTAL = "employee_portal";
export const ADMIN_PORTAL = "admin_portal";

export function normalizeLoginContext(value) {
  const context = String(value || "").trim().toLowerCase();
  if (context === ADMIN_PORTAL) return ADMIN_PORTAL;
  return EMPLOYEE_PORTAL;
}

export function isPortalContextAllowed(session, allowedContexts = []) {
  const context = normalizeLoginContext(session?.login_context);
  if (!Array.isArray(allowedContexts) || allowedContexts.length === 0) {
    return true;
  }
  return allowedContexts.includes(context);
}
