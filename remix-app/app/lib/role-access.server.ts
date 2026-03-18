const RESET_ALLOWED_ROLES = new Set([
  "admin",
  "super_admin",
  "hr_payroll",
  "hr-payroll",
  "hr payroll",
  "hrpayroll",
]);

export function normalizeRole(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function canManagePinReset(role: unknown) {
  return RESET_ALLOWED_ROLES.has(normalizeRole(role));
}
