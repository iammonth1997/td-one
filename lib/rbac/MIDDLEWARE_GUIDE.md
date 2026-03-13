/**
 * API Guard Middleware Migration Guide
 * =====================================
 *
 * This document explains how to use the new centralized RBAC middleware
 * to replace inline permission checks in API routes.
 */

/**
 * BEFORE: Old Pattern with Inline Permission Checks
 * -------------------------------------------------
 * 
 * app/api/attendance/today/route.js
 */

// import { validateSession } from "@/lib/auth";
// import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
// import { hasAnyPermission } from "@/lib/rbac/access";
//
// export async function GET(req) {
//   const { session, error: authError, status: authStatus } = await validateSession(req);
//   if (authError) return Response.json({ error: authError }, { status: authStatus });
//
//   const accessProfile = buildSessionAccessProfile(session);
//   if (!hasAnyPermission(accessProfile, ["attendance.read.self", "attendance.read.all", "rbac.manage"])) {
//     return Response.json({ error: "FORBIDDEN" }, { status: 403 });
//   }
//
//   // ... rest of handler logic ...
// }

/**
 * AFTER: New Pattern with Middleware
 * ----------------------------------
 * 
 * This approach is much cleaner and centralizes permission logic:
 * - Reduces boilerplate (3-5 lines per route → 1 line)
 * - Enables audit logging in one place
 * - Makes permissions discoverable in apiRouteMap.js
 */

import { createGuard } from "@/lib/rbac/apiGuard";

const attendanceHandler = async (req) => {
  // All authentication and permission checking is done by middleware
  // This handler only contains business logic
  // ... handler logic ...
  return Response.json({ data: "attendance for today" });
};

export const GET = createGuard(attendanceHandler, {
  requiredPermissions: ["attendance.read.self", "attendance.read.all"],
  fallbackPermissions: ["rbac.manage"],
  route: "/api/attendance/today",
  method: "GET",
});

/**
 * FOR ROUTES WITH MULTIPLE METHODS (GET, POST, PUT)
 * ==================================================
 * 
 * Use createMultiGuard for routes with different permission requirements per method:
 */

import { createMultiGuard } from "@/lib/rbac/apiGuard";

// Example: /api/leave-request with different permissions for GET vs POST
const handlers = createMultiGuard("/api/leave-request", {
  GET: {
    handler: async (req) => {
      // Retrieve leave requests
      return Response.json({ data: [] });
    },
    requiredPermissions: [
      "leave.request.self",
      "leave.request.approve",
      "leave.request.manage",
    ],
    fallbackPermissions: ["rbac.manage"],
  },
  POST: {
    handler: async (req) => {
      // Create leave request
      return Response.json({ success: true });
    },
    requiredPermissions: ["leave.request.self", "leave.request.manage"],
    fallbackPermissions: ["rbac.manage"],
  },
});

export const GET = handlers.GET;
export const POST = handlers.POST;

/**
 * KEY BENEFITS
 * ============
 *
 * 1. Centralized Permission Definition
 *    - All permissions for a route are in one place (apiRouteMap.js)
 *    - Easy to audit which routes require which permissions
 *    - Changes to permissions don't require touching route files
 *
 * 2. Automatic Audit Logging
 *    - Every permission denial is logged with user, role, and required permissions
 *    - Helps debug access issues and monitor for unauthorized attempts
 *    - Extensible to log to Supabase audit table
 *
 * 3. Consistent Enforcement
 *    - Same permission check pattern across all routes
 *    - Eliminates copy-paste errors in permission arrays
 *    - Reduces attack surface by standardizing enforcement
 *
 * 4. Backward Compatibility
 *    - Fallback permissions support legacy admin role checks
 *    - Can migrate routes incrementally
 *    - No breaking changes to existing flows
 *
 * 5. Cleaner Route Code
 *    - Handlers focus only on business logic
 *    - Authentication/authorization concerns separated
 *    - Easier to understand and maintain
 *
 * REFACTORING PRIORITY
 * ====================
 *
 * Routes with highest priority for refactoring (most security-sensitive):
 * 1. Admin routes: login/admin/*, attendance/admin/*
 * 2. Approval routes: leave-request/[id], ot-request/[id]
 * 3. Security routes: login/reset-pin, login/forgot-pin
 * 4. Settings routes: work-locations, line/rich-menu
 *
 * Current Status:
 * ✓ Middleware created (apiGuard.js, apiRouteMap.js)
 * ✓ All 29 existing routes still work with inline checks
 * ⏳ Routes can be incrementally refactored to use createGuard/createMultiGuard
 */
