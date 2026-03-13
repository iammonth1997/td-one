import { APP_ROLES, READ_ONLY_ROLES } from "@/lib/rbac/roles";

export const ROLE_PERMISSIONS = {
  SUPER_ADMIN: [
    "rbac.manage",
    "settings.manage.system",
    "settings.work_location.manage",
    "settings.rich_menu.manage",
    "security.pin.reset.manage",
    "security.session.revoke",
    "audit.read.pin_reset",
    "audit.read.all",
    "daywork.read.self",
    "daywork.read.all",
    "attendance.read.all",
    "attendance.edit.all",
    "employee.manage.all",
    "ot.request.self",
    "ot.read.all",
    "ot.approve.company",
    "leave.approve.company",
    "reports.read.executive",
  ],
  DIRECTOR: [
    "dashboard.read.company",
    "reports.read.executive",
    "audit.read.all",
    "leave.approve.company",
  ],
  DEPT_MANAGER: [
    "dashboard.read.department",
    "daywork.read.self",
    "daywork.read.all",
    "attendance.read.department",
    "employee.read.department",
    "time_correction.request.self",
    "time_correction.read.all",
    "ot.read.department",
    "ot.approve.department",
    "leave.approve.department",
  ],
  SECTION_MANAGER: [
    "dashboard.read.team",
    "daywork.read.self",
    "daywork.read.all",
    "attendance.read.team",
    "employee.read.department",
    "time_correction.request.self",
    "time_correction.read.all",
    "ot.read.team",
    "ot.approve.section",
    "leave.approve.section",
  ],
  ASST_MANAGER: [
    "dashboard.read.team",
    "daywork.read.self",
    "attendance.read.team",
    "employee.read.department",
    "time_correction.request.self",
    "time_correction.read.self",
    "ot.read.team",
  ],
  DEPT_ADMIN: [
    "daywork.read.self",
    "daywork.read.all",
    "attendance.read.department",
    "attendance.edit.department",
    "employee.read.department",
    "employee.manage.department",
    "time_correction.request.self",
    "time_correction.read.all",
    "ot.read.department",
  ],
  SUPERINTENDENT: [
    "dashboard.read.department",
    "daywork.read.self",
    "daywork.read.all",
    "attendance.read.department",
    "time_correction.request.self",
    "time_correction.read.all",
    "ot.read.department",
    "ot.approve.department",
    "leave.approve.department",
  ],
  HEAD_SUPERVISOR: [
    "dashboard.read.team",
    "daywork.read.self",
    "daywork.read.all",
    "attendance.read.team",
    "time_correction.request.self",
    "time_correction.read.all",
    "ot.read.team",
    "ot.approve.section",
    "leave.approve.section",
  ],
  FOREMAN: ["dashboard.read.team", "daywork.read.self", "attendance.read.team", "time_correction.request.self", "time_correction.read.self", "ot.read.team"],
  ENGINEER: [
    "daywork.read.self",
    "attendance.read.self",
    "attendance.read.team",
    "employee.read.department",
    "time_correction.request.self",
    "time_correction.read.self",
    "ot.request.self",
    "ot.read.self",
  ],
  TRAINER: ["training.read.department", "training.manage.department"],
  EMPLOYEE: [
    "daywork.read.self",
    "attendance.read.self",
    "time_correction.request.self",
    "time_correction.read.self",
    "leave.request.self",
    "payroll.read.self",
    "ot.request.self",
    "ot.read.self",
  ],
  HR_MANAGER: [
    "settings.work_location.manage",
    "security.pin.reset.manage",
    "audit.read.pin_reset",
    "daywork.read.all",
    "attendance.read.all",
    "attendance.edit.all",
    "time_correction.read.all",
    "recruitment.manage",
    "welfare.manage.department",
    "training.manage.department",
    "payroll.read.full",
    "ot.read.all",
    "ot.approve.company",
    "leave.approve.company",
  ],
  HR_RECRUITMENT: ["recruitment.read", "recruitment.manage"],
  HR_TIME_ATTENDANCE: ["daywork.read.all", "attendance.read.all", "attendance.edit.all", "time_correction.read.all", "ot.read.all"],
  HR_PAYROLL: [
    "settings.work_location.manage",
    "settings.rich_menu.manage",
    "security.pin.reset.manage",
    "security.session.revoke",
    "audit.read.pin_reset",
    "daywork.read.all",
    "payroll.read.full",
    "attendance.read.all",
    "time_correction.read.all",
    "ot.read.all",
    "ot.approve.company",
  ],
  HR_WELFARE: ["welfare.read.department", "welfare.manage.department"],
  HR_TRAINING: ["training.read.department", "training.manage.department"],
  HR_HRBP: [
    "daywork.read.all",
    "attendance.read.department",
    "employee.read.department",
    "welfare.read.department",
    "time_correction.read.all",
    "ot.read.department",
  ],
  ACCOUNTING_HEAD: ["accounting.read", "accounting.manage", "payroll.read.summary"],
  ACCOUNTING_STAFF: ["accounting.read", "accounting.manage"],
  WAREHOUSE_HEAD: ["inventory.read", "inventory.manage"],
  AUDITOR: ["audit.read.all", "audit.read.pin_reset", "reports.read.executive", "attendance.read.all", "ot.read.all", "daywork.read.all", "time_correction.read.all"],
  SHE_MANAGER: ["she.read.all", "she.manage.area"],
  SHE_OFFICER: ["she.read.area", "she.manage.area"],
};

export function getPermissionsForRoles(roles = []) {
  const permissions = new Set();
  for (const role of roles) {
    for (const permission of ROLE_PERMISSIONS[role] || []) {
      permissions.add(permission);
    }
  }
  return permissions;
}

export function validateRolePermissionsMatrix() {
  for (const role of APP_ROLES) {
    if (!ROLE_PERMISSIONS[role] || ROLE_PERMISSIONS[role].length === 0) {
      throw new Error(`RBAC misconfigured: role ${role} has no permissions`);
    }
  }

  for (const role of READ_ONLY_ROLES) {
    const rolePermissions = ROLE_PERMISSIONS[role] || [];
    const hasWritePermission = rolePermissions.some(
      (permission) => permission.endsWith(".manage") || permission.endsWith(".edit")
    );

    if (hasWritePermission) {
      throw new Error(`RBAC misconfigured: read-only role ${role} has write permission`);
    }
  }
}
