import { APP_ROLES } from "@/lib/rbac/roles";
import { buildAccessProfile, hasAnyPermission, hasPermission } from "@/lib/rbac/access";

const ROLE_ALIAS_MAP = {
  admin: "SUPER_ADMIN",
  super_admin: "SUPER_ADMIN",
  director: "DIRECTOR",
  dept_manager: "DEPT_MANAGER",
  department_manager: "DEPT_MANAGER",
  section_manager: "SECTION_MANAGER",
  asst_manager: "ASST_MANAGER",
  assistant_manager: "ASST_MANAGER",
  dept_admin: "DEPT_ADMIN",
  department_admin: "DEPT_ADMIN",
  superintendent: "SUPERINTENDENT",
  head_supervisor: "HEAD_SUPERVISOR",
  foreman: "FOREMAN",
  engineer: "ENGINEER",
  trainer: "TRAINER",
  employee: "EMPLOYEE",
  hr_manager: "HR_MANAGER",
  hr_recruitment: "HR_RECRUITMENT",
  hr_time_attendance: "HR_TIME_ATTENDANCE",
  hr_payroll: "HR_PAYROLL",
  hr_welfare: "HR_WELFARE",
  hr_training: "HR_TRAINING",
  hr_hrbp: "HR_HRBP",
  accounting_head: "ACCOUNTING_HEAD",
  accounting_staff: "ACCOUNTING_STAFF",
  warehouse_head: "WAREHOUSE_HEAD",
  auditor: "AUDITOR",
  she_manager: "SHE_MANAGER",
  she_officer: "SHE_OFFICER",
};

const LEGACY_ADMIN_ROLES = new Set([
  "admin",
  "super_admin",
  "hr_payroll",
  "hr-payroll",
  "hr payroll",
  "hrpayroll",
]);

function normalizeRole(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
}

export function mapSessionRoleToAppRole(role) {
  if (!role) return null;

  const upperRole = String(role || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");

  if (APP_ROLES.includes(upperRole)) {
    return upperRole;
  }

  const normalized = normalizeRole(role);
  return ROLE_ALIAS_MAP[normalized] || null;
}

export function buildSessionAccessProfile(session) {
  const mappedRole = mapSessionRoleToAppRole(session?.role);
  const roles = mappedRole ? [mappedRole] : [];

  const profile = buildAccessProfile({
    roles,
    scopes: Array.isArray(session?.scopes) ? session.scopes : [],
  });

  return {
    ...profile,
    appRoles: roles,
    legacyRole: normalizeRole(session?.role),
    sourceRole: session?.role || null,
  };
}

export function hasPermissionForSession(session, permission) {
  const profile = buildSessionAccessProfile(session);
  return hasPermission(profile, permission);
}

export function hasAnyPermissionForSession(session, permissions = []) {
  const profile = buildSessionAccessProfile(session);
  return hasAnyPermission(profile, permissions);
}

export function isLegacyAdminRole(role) {
  return LEGACY_ADMIN_ROLES.has(normalizeRole(role));
}

export function canManageAdminActions(session, accessProfile = null) {
  if (isLegacyAdminRole(session?.role)) {
    return true;
  }

  const profile = accessProfile || buildSessionAccessProfile(session);
  return hasAnyPermission(profile, [
    "rbac.manage",
    "attendance.edit.all",
    "employee.manage.all",
    "leave.approve.company",
  ]);
}
