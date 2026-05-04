// @ts-ignore legacy JS RBAC module used by both server routes and UI filtering.
import { hasAnyPermission as legacyHasAnyPermission } from "@/lib/rbac/access";
// @ts-ignore legacy JS RBAC module used by both server routes and UI filtering.
import { buildSessionAccessProfile as buildLegacySessionAccessProfile } from "@/lib/rbac/sessionAccess";

import { ADMIN_PORTAL, normalizeLoginContext } from "~/lib/session-context";

export type AccessProfile = {
  permissions: string[];
  appRoles: string[];
  legacyRole: string;
  sourceRole: string | null;
};

export type AdminSidebarGroupKey = "overview" | "hr" | "workflow" | "payroll" | "security" | "settings";

type AdminRouteAccess = {
  path: string;
  permissionsAny: string[];
};

const PIN_RESET_PERMISSIONS = ["security.pin.reset.manage", "rbac.manage"];

const ADMIN_LOGIN_PERMISSIONS = [
  "leave.approve.section",
  "leave.approve.department",
  "leave.approve.company",
  "ot.approve.section",
  "ot.approve.department",
  "ot.approve.company",
  "attendance.edit.department",
  "attendance.edit.all",
  "employee.manage.department",
  "employee.manage.all",
  "time_correction.read.all",
  "recruitment.manage",
  "payroll.read.full",
  "security.pin.reset.manage",
  "security.session.revoke",
  "audit.read.all",
  "settings.work_location.manage",
  "settings.rich_menu.manage",
  "audit.read.pin_reset",
  "rbac.manage",
];

const ADMIN_ROUTE_ACCESS: AdminRouteAccess[] = [
  { path: "/admin/dashboard", permissionsAny: [] },
  { path: "/admin/requests", permissionsAny: [] },
  {
    path: "/admin/employees",
    permissionsAny: ["employee.manage.all", "employee.manage.department", "employee.read.department", "payroll.read.full", "rbac.manage"],
  },
  {
    path: "/admin/attendance",
    permissionsAny: [
      "attendance.read.team",
      "attendance.read.department",
      "attendance.read.all",
      "attendance.edit.department",
      "attendance.edit.all",
      "daywork.read.all",
      "rbac.manage",
    ],
  },
  { path: "/admin/recruitment", permissionsAny: ["recruitment.read", "recruitment.manage", "rbac.manage"] },
  { path: "/admin/hr-er", permissionsAny: ["welfare.read.department", "welfare.manage.department", "rbac.manage"] },
  { path: "/admin/payroll", permissionsAny: ["payroll.read.full", "rbac.manage"] },
  { path: "/admin/upload-slip", permissionsAny: ["payroll.read.full", "rbac.manage"] },
  { path: "/admin/devices", permissionsAny: ["security.session.revoke", "rbac.manage"] },
  { path: "/admin/audit", permissionsAny: ["audit.read.all", "audit.read.pin_reset", "rbac.manage"] },
  { path: "/admin/work-locations", permissionsAny: ["settings.work_location.manage", "rbac.manage"] },
  { path: "/admin/pay-policies", permissionsAny: ["payroll.read.full", "rbac.manage"] },
  { path: "/admin/shifts", permissionsAny: ["attendance.edit.all", "attendance.edit.department", "rbac.manage"] },
  { path: "/admin/settings/deductions", permissionsAny: ["payroll.read.full", "welfare.manage.department", "rbac.manage"] },
  { path: "/admin/settings/admins", permissionsAny: ["rbac.manage", "security.pin.reset.manage"] },
  { path: "/forgot-password", permissionsAny: PIN_RESET_PERMISSIONS },
  { path: "/forgot-pin", permissionsAny: PIN_RESET_PERMISSIONS },
  { path: "/reset-password", permissionsAny: PIN_RESET_PERMISSIONS },
  { path: "/reset-pin", permissionsAny: PIN_RESET_PERMISSIONS },
];

const ADMIN_HOME_CANDIDATES = [
  "/admin/dashboard",
  "/admin/requests",
  "/admin/attendance",
  "/admin/recruitment",
  "/admin/hr-er",
  "/admin/payroll/salary",
  "/admin/devices",
  "/admin/work-locations",
];

export function normalizeRole(value: unknown) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

export function normalizeRoleKey(value: unknown) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

export function isHrRole(value: unknown) {
  return normalizeRoleKey(value).startsWith("HR_");
}

function getAppRoleKey(role: unknown) {
  return buildRoleAccessProfile(role).appRoles[0] ?? normalizeRoleKey(role);
}

export function buildRoleAccessProfile(role: unknown): AccessProfile {
  return buildLegacySessionAccessProfile({ role }) as AccessProfile;
}

export function hasAnyPermissionForRole(role: unknown, permissions: string[]) {
  if (permissions.length === 0) return false;
  return legacyHasAnyPermission(buildRoleAccessProfile(role), permissions);
}

export function canManagePinReset(role: unknown) {
  return hasAnyPermissionForRole(role, PIN_RESET_PERMISSIONS);
}

export function canAccessAdminPortal(role: unknown, loginContext?: string | null) {
  const context = normalizeLoginContext(loginContext);
  return context === ADMIN_PORTAL && (isHrRole(role) || hasAnyPermissionForRole(role, ADMIN_LOGIN_PERMISSIONS));
}

export function canViewAdminSidebarGroup(role: unknown, groupKey: AdminSidebarGroupKey) {
  if (groupKey !== "hr") {
    return true;
  }

  const roleKey = getAppRoleKey(role);
  return (
    roleKey === "SUPER_ADMIN" ||
    roleKey === "ADMIN" ||
    roleKey === "HR_ADMIN" ||
    roleKey === "HR_MANAGER" ||
    roleKey === "HR_TIME_ATTENDANCE"
  );
}

function matchesRoute(pathname: string, routePath: string) {
  return pathname === routePath || pathname.startsWith(`${routePath}/`);
}

function getAdminRouteAccess(pathname: string) {
  return ADMIN_ROUTE_ACCESS.find((route) => matchesRoute(pathname, route.path)) ?? null;
}

export function canAccessAdminPath(role: unknown, pathname: string, loginContext: string | null = ADMIN_PORTAL) {
  const access = getAdminRouteAccess(pathname);
  if (!access) {
    return pathname === "/admin" ? canAccessAdminPortal(role, loginContext) : false;
  }

  if (access.permissionsAny.length === 0) {
    return canAccessAdminPortal(role, loginContext);
  }

  return normalizeLoginContext(loginContext) === ADMIN_PORTAL && hasAnyPermissionForRole(role, access.permissionsAny);
}

export function getFirstAccessibleAdminPath(role: unknown, loginContext: string | null = ADMIN_PORTAL) {
  return ADMIN_HOME_CANDIDATES.find((path) => canAccessAdminPath(role, path, loginContext)) ?? null;
}
