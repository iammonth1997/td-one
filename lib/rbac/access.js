import { getPermissionsForRoles } from "@/lib/rbac/rolePermissions";
import { getAllowedActions, getVisibleMenus } from "@/lib/rbac/menuMap";

export function buildAccessProfile({ roles = [], scopes = [] } = {}) {
  const permissionSet = getPermissionsForRoles(roles);
  return {
    roles,
    scopes,
    permissions: [...permissionSet],
    visibleMenus: getVisibleMenus(permissionSet),
    allowedActions: getAllowedActions(permissionSet),
  };
}

export function hasPermission(accessProfile, permission) {
  return Boolean(accessProfile?.permissions?.includes(permission));
}

export function hasAnyPermission(accessProfile, permissions = []) {
  return permissions.some((permission) => hasPermission(accessProfile, permission));
}
