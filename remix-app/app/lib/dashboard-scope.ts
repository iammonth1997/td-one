import { isHrRole, normalizeRoleKey } from "~/lib/request-types";

export type DashboardScope =
  | {
      kind: "all";
      departmentFilter: null;
      departmentName: null;
    }
  | {
      kind: "department";
      departmentFilter: number;
      departmentName: string | null;
    }
  | {
      kind: "none";
      departmentFilter: null;
      departmentName: null;
    };

type DashboardScopeUser = {
  role: string | null;
  departmentId: number | null;
  departmentName?: string | null;
};

export function getDashboardScope(user: DashboardScopeUser): DashboardScope {
  const roleKey = normalizeRoleKey(user.role);

  if (roleKey === "SUPER_ADMIN" || roleKey === "ADMIN" || isHrRole(roleKey)) {
    return {
      kind: "all",
      departmentFilter: null,
      departmentName: null,
    };
  }

  if (user.departmentId != null) {
    return {
      kind: "department",
      departmentFilter: user.departmentId,
      departmentName: user.departmentName ?? null,
    };
  }

  return {
    kind: "none",
    departmentFilter: null,
    departmentName: null,
  };
}
