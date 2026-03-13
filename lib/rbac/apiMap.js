export const API_PERMISSION_MAP = {
  "GET /api/attendance": {
    permissionsAny: ["attendance.read.department", "attendance.read.all"],
    scopeStrategy: "department_or_company",
  },
  "POST /api/attendance/clock": {
    permissionsAny: ["attendance.read.self"],
    scopeStrategy: "self",
  },
  "PUT /api/attendance/[id]": {
    permissionsAny: ["attendance.edit.department", "attendance.edit.all"],
    scopeStrategy: "department_or_company",
  },
  "PUT /api/leave/[id]/approve": {
    permissionsAny: ["leave.approve.section", "leave.approve.department", "leave.approve.company"],
    scopeStrategy: "approval_scope",
    approvalPolicy: "sequential",
  },
  "PUT /api/employees/[id]/role-assignments": {
    permissionsAny: ["rbac.manage"],
    scopeStrategy: "company",
  },
  "GET /api/reports/audit-exceptions": {
    permissionsAny: ["audit.read.all"],
    scopeStrategy: "company",
  },
};

export function getApiGuardConfig(method, pathname) {
  return API_PERMISSION_MAP[`${method.toUpperCase()} ${pathname}`] || null;
}
