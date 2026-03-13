/**
 * API Route Permission Map
 * Central registry of all protected routes and their required permissions
 * Used for documentation, audit logging, and middleware enforcement
 */

export const API_ROUTE_MAP = {
  // ===== ATTENDANCE DOMAIN =====
  attendance: {
    "GET /api/attendance/today": {
      permissions: ["attendance.read.self", "attendance.read.all"],
      fallback: ["rbac.manage"],
      description: "Get today's attendance status",
    },
    "POST /api/attendance/scan": {
      permissions: ["attendance.scanin"],
      fallback: ["rbac.manage"],
      description: "Scan in/out attendance",
    },
    "POST /api/attendance/verify-location": {
      permissions: ["attendance.verify_location"],
      fallback: ["rbac.manage"],
      description: "Verify location for check-in",
    },
    "POST /api/attendance/admin/reset-device": {
      permissions: ["attendance.admin.reset_device"],
      fallback: ["rbac.manage"],
      description: "Admin: Reset device for user",
    },
  },

  // ===== LEAVE DOMAIN =====
  leave: {
    "GET /api/leave-request": {
      permissions: [
        "leave.request.self",
        "leave.request.approve",
        "leave.request.manage",
      ],
      fallback: ["rbac.manage"],
      description: "Get leave requests",
    },
    "POST /api/leave-request": {
      permissions: ["leave.request.self", "leave.request.manage"],
      fallback: ["rbac.manage"],
      description: "Create leave request",
    },
    "GET /api/leave-request/[id]": {
      permissions: [
        "leave.request.self",
        "leave.request.approve",
        "leave.request.manage",
      ],
      fallback: ["rbac.manage"],
      description: "Get specific leave request",
    },
    "PUT /api/leave-request/[id]": {
      permissions: [
        "leave.request.self",
        "leave.request.approve",
        "leave.request.manage",
      ],
      fallback: ["rbac.manage"],
      description: "Update leave request",
    },
  },

  // ===== OVERTIME (OT) DOMAIN =====
  ot: {
    "GET /api/ot-request": {
      permissions: ["ot.read.self", "ot.read.team", "ot.read.all"],
      fallback: ["rbac.manage"],
      description: "Get OT requests",
    },
    "POST /api/ot-request": {
      permissions: ["ot.request.self"],
      fallback: ["rbac.manage"],
      description: "Create OT request",
    },
    "GET /api/ot-request/[id]": {
      permissions: [
        "ot.read.self",
        "ot.read.team",
        "ot.read.all",
        "ot.approve.section",
      ],
      fallback: ["rbac.manage"],
      description: "Get OT request details",
    },
    "PUT /api/ot-request/[id]": {
      permissions: ["ot.approve.section", "ot.approve.department"],
      fallback: ["rbac.manage"],
      description: "Approve/reject OT request",
    },
    "POST /api/ot-request/check-duplicate": {
      permissions: ["ot.request.self", "ot.read.all"],
      fallback: ["rbac.manage"],
      description: "Check for duplicate OT requests",
    },
  },

  // ===== TIME CORRECTION DOMAIN =====
  time_correction: {
    "POST /api/time-correction-request": {
      permissions: [
        "time_correction.request.self",
        "time_correction.read.all",
      ],
      fallback: ["rbac.manage"],
      description: "Create time correction request",
    },
  },

  // ===== DAYWORK DOMAIN =====
  daywork: {
    "GET /api/login/daywork": {
      permissions: ["daywork.read.self", "daywork.read.all"],
      fallback: ["rbac.manage"],
      description: "Get daywork data",
    },
  },

  // ===== SECURITY/PIN MANAGEMENT DOMAIN =====
  security: {
    "POST /api/login/reset-pin": {
      permissions: [
        "security.pin.reset.self",
        "security.pin.reset.manage",
      ],
      fallback: ["rbac.manage"],
      description: "Reset own PIN",
    },
    "POST /api/login/forgot-pin": {
      permissions: [
        "security.pin.reset.self",
        "security.pin.reset.manage",
      ],
      fallback: ["rbac.manage"],
      description: "Request PIN reset via security questions",
    },
    "POST /api/login/admin/issue-temp-pin": {
      permissions: ["security.pin.reset.manage"],
      fallback: ["rbac.manage"],
      description: "Admin: Issue temporary PIN",
    },
    "GET /api/login/admin/pin-reset-audit": {
      permissions: ["audit.read.pin_reset"],
      fallback: ["rbac.manage"],
      description: "Admin: Audit log of PIN resets",
    },
    "POST /api/login/admin/revoke-sessions": {
      permissions: ["security.session.revoke"],
      fallback: ["rbac.manage"],
      description: "Admin: Revoke user sessions",
    },
  },

  // ===== SETTINGS DOMAIN =====
  settings: {
    "GET /api/work-locations": {
      permissions: ["settings.work_location.read", "settings.work_location.manage"],
      fallback: ["rbac.manage"],
      description: "Get work locations",
    },
    "POST /api/work-locations": {
      permissions: ["settings.work_location.manage"],
      fallback: ["rbac.manage"],
      description: "Create/update work location",
    },
    "POST /api/line/rich-menu": {
      permissions: ["settings.rich_menu.manage"],
      fallback: ["rbac.manage"],
      description: "Manage LINE rich menu",
    },
  },

  // ===== PAYROLL DOMAIN =====
  payroll: {
    "GET /api/request-history": {
      permissions: [
        "payroll.read.self",
        "payroll.read.full",
        "payroll.read.summary",
      ],
      fallback: ["rbac.manage"],
      description: "Get request history",
    },
    "GET /api/ot-slip": {
      permissions: [
        "payroll.read.self",
        "payroll.read.full",
        "payroll.read.summary",
      ],
      fallback: ["rbac.manage"],
      description: "Get OT slip",
    },
    "GET /api/salary-slip": {
      permissions: [
        "payroll.read.self",
        "payroll.read.full",
        "payroll.read.summary",
      ],
      fallback: ["rbac.manage"],
      description: "Get salary slip",
    },
  },

  // ===== UTILITY/CLOUDINARY DOMAIN =====
  utility: {
    "POST /api/cloudinary/sign": {
      permissions: [
        "attendance.scanin",
        "leave.request.self",
        "time_correction.request.self",
        "ot.request.self",
      ],
      fallback: ["rbac.manage"],
      description: "Get Cloudinary signature for image upload",
    },
  },
};

/**
 * Get all routes matching a pattern
 * @param {string} pattern - Route pattern (e.g., "attendance.*", "*.manage")
 * @returns {Object} Routes matching the pattern
 */
export function getRoutesByPattern(pattern) {
  const routes = {};
  const regexPattern = new RegExp(pattern.replace("*", ".*"));

  Object.entries(API_ROUTE_MAP).forEach(([, domainRoutes]) => {
    Object.entries(domainRoutes).forEach(([route, config]) => {
      if (regexPattern.test(route)) {
        routes[route] = config;
      }
    });
  });

  return routes;
}

/**
 * Get all unique permissions used across all routes
 * @returns {Set<string>} Set of all permissions
 */
export function getAllUsedPermissions() {
  const permissions = new Set();

  Object.values(API_ROUTE_MAP).forEach((domainRoutes) => {
    Object.values(domainRoutes).forEach((config) => {
      config.permissions?.forEach((p) => permissions.add(p));
      config.fallback?.forEach((p) => permissions.add(p));
    });
  });

  return permissions;
}

/**
 * Get all routes requiring a specific permission
 * @param {string} permission - Permission to search for
 * @returns {Object} Routes requiring this permission
 */
export function getRoutesByPermission(permission) {
  const routes = {};

  Object.entries(API_ROUTE_MAP).forEach(([, domainRoutes]) => {
    Object.entries(domainRoutes).forEach(([route, config]) => {
      if (
        config.permissions?.includes(permission) ||
        config.fallback?.includes(permission)
      ) {
        routes[route] = config;
      }
    });
  });

  return routes;
}
