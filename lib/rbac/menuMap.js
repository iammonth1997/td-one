export const PERMISSION_TO_MENU = {
  "attendance.read.self": ["dashboard", "clock", "history"],
  "attendance.read.team": ["dashboard", "attendance"],
  "attendance.read.department": ["dashboard", "attendance"],
  "daywork.read.self": ["dashboard", "history"],
  "daywork.read.all": ["dashboard", "attendance"],
  "time_correction.request.self": ["leave"],
  "time_correction.read.self": ["leave"],
  "time_correction.read.all": ["approvals", "leave"],
  "ot.request.self": ["leave"],
  "ot.read.self": ["leave"],
  "ot.read.team": ["approvals", "leave"],
  "ot.read.department": ["approvals", "leave"],
  "ot.read.all": ["approvals", "leave"],
  "ot.approve.section": ["approvals", "leave"],
  "ot.approve.department": ["approvals", "leave"],
  "ot.approve.company": ["approvals", "leave"],
  "leave.request.self": ["leave"],
  "leave.approve.section": ["approvals", "leave"],
  "leave.approve.department": ["approvals", "leave"],
  "payroll.read.self": ["payslip"],
  "payroll.read.full": ["payroll"],
  "recruitment.read": ["recruitment"],
  "welfare.read.department": ["welfare"],
  "training.read.department": ["training"],
  "inventory.read": ["inventory"],
  "accounting.read": ["accounting"],
  "she.read.area": ["she"],
  "she.read.all": ["she", "reports"],
  "reports.read.executive": ["reports"],
  "security.pin.reset.manage": ["settings"],
  "security.session.revoke": ["settings"],
  "settings.work_location.manage": ["settings"],
  "settings.rich_menu.manage": ["settings"],
  "audit.read.pin_reset": ["settings"],
  "rbac.manage": ["settings", "rbac"],
};

export const PERMISSION_TO_ACTIONS = {
  "leave.approve.section": ["leave.approve", "leave.reject", "leave.escalate"],
  "leave.approve.department": ["leave.approve", "leave.reject", "leave.escalate"],
  "attendance.edit.department": ["attendance.edit", "attendance.correction.create"],
  "employee.manage.department": ["employee.create", "employee.edit", "employee.resetPin"],
  "rbac.manage": ["rbac.assignRole", "rbac.assignScope", "rbac.editRolePermissions"],
};

export function getVisibleMenus(permissionSet) {
  const menus = new Set();
  for (const permission of permissionSet || []) {
    const mappedMenus = PERMISSION_TO_MENU[permission] || [];
    for (const menu of mappedMenus) {
      menus.add(menu);
    }
  }
  return [...menus];
}

export function getAllowedActions(permissionSet) {
  const actions = new Set();
  for (const permission of permissionSet || []) {
    const mappedActions = PERMISSION_TO_ACTIONS[permission] || [];
    for (const action of mappedActions) {
      actions.add(action);
    }
  }
  return [...actions];
}
