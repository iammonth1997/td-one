/**
 * API Guard Middleware
 * Centralized RBAC enforcement for Next.js API routes
 * Eliminates repeated permission checks across routes
 */

import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { validateSession } from "@/lib/validateSession";
import { hasAnyPermission } from "@/lib/rbac/access";

/**
 * Standard response for forbidden access
 */
function forbiddenResponse(reason = "Access denied") {
  return new Response(JSON.stringify({ error: "FORBIDDEN", reason }), {
    status: 403,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Log permission denial for audit trail
 * @param {Object} session - User session object
 * @param {string} route - API route path
 * @param {string} method - HTTP method (GET, POST, etc)
 * @param {Array<string>} requiredPermissions - Permissions checked
 * @param {string} denialReason - Reason for denial
 */
async function logPermissionDenial(
  session,
  route,
  method,
  requiredPermissions,
  denialReason
) {
  // Log to console for development
  console.warn(
    `[RBAC DENIAL] Route: ${method} ${route} | User: ${session?.emp_id} | Role: ${session?.role} | Required: [${requiredPermissions.join(", ")}] | Reason: ${denialReason}`
  );

  // TODO: Send to audit table in Supabase
  // const { createClient } = require("@supabase/supabase-js");
  // const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  // await supabase.from("audit_logs").insert({
  //   action: "permission_denied",
  //   route,
  //   method,
  //   emp_id: session?.emp_id,
  //   role: session?.role,
  //   required_permissions: requiredPermissions,
  //   denied_reason: denialReason,
  //   timestamp: new Date(),
  // });
}

/**
 * Create a guarded route handler
 * Enforces RBAC permission checks before reaching the main handler
 *
 * @param {Function} handler - Next.js route handler (GET, POST, etc)
 * @param {Object} config - Guard configuration
 * @param {Array<string>} config.requiredPermissions - Permissions to check
 * @param {string} config.route - Route path (for logging)
 * @param {string} config.method - HTTP method (for logging)
 * @param {boolean} config.allowUnauth - Allow unauthenticated access (default: false)
 * @param {Array<string>} config.fallbackPermissions - Additional legacy role checks (default: [])
 * @returns {Function} Wrapped handler with RBAC enforcement
 *
 * @example
 * // Simple usage
 * const GET = createGuard(async (req) => {
 *   return Response.json({ data: "protected" });
 * }, {
 *   requiredPermissions: ["attendance.read.all"],
 *   route: "/api/attendance/logs",
 *   method: "GET",
 * });
 *
 * @example
 * // With fallback for backward compatibility
 * const POST = createGuard(async (req) => {
 *   return Response.json({ success: true });
 * }, {
 *   requiredPermissions: ["leave.approve.company"],
 *   fallbackPermissions: ["rbac.manage"],
 *   route: "/api/leave-request/[id]",
 *   method: "POST",
 * });
 */
export function createGuard(handler, config = {}) {
  const {
    requiredPermissions = [],
    route = "unknown",
    method = "unknown",
    allowUnauth = false,
    fallbackPermissions = [],
  } = config;

  return async function guardedHandler(req) {
    // Step 1: Validate session
    const { session, error: authError, status: authStatus } = await validateSession(req);

    if (authError) {
      if (allowUnauth) {
        // Allow unauthenticated access to proceed
        return handler(req);
      }
      return new Response(JSON.stringify({ error: authError }), {
        status: authStatus,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Step 2: Build access profile
    const accessProfile = buildSessionAccessProfile(session);

    // Step 3: Check permissions
    const allRequiredPermissions = [
      ...requiredPermissions,
      ...fallbackPermissions,
    ];

    if (!hasAnyPermission(accessProfile, allRequiredPermissions)) {
      await logPermissionDenial(
        session,
        route,
        method,
        allRequiredPermissions,
        `User does not have any of the required permissions`
      );
      return forbiddenResponse("Insufficient permissions for this action");
    }

    // Step 4: Call the actual handler
    return handler(req);
  };
}

/**
 * Create multiple method handlers for the same route with different permission requirements
 * Useful for routes with GET and POST that require different permissions
 *
 * @param {string} route - Route path (for logging)
 * @param {Object} handlers - Object with method names as keys, each containing { handler, permissions }
 * @returns {Object} Object with guarded handler functions
 *
 * @example
 * const handlers = createMultiGuard("/api/resource", {
 *   GET: {
 *     handler: async (req) => Response.json(data),
 *     requiredPermissions: ["resource.read.all"],
 *   },
 *   POST: {
 *     handler: async (req) => Response.json(result),
 *     requiredPermissions: ["resource.create"],
 *     fallbackPermissions: ["rbac.manage"],
 *   },
 * });
 *
 * export const GET = handlers.GET;
 * export const POST = handlers.POST;
 */
export function createMultiGuard(route, handlers = {}) {
  const result = {};

  Object.entries(handlers).forEach(([method, config]) => {
    if (typeof config.handler !== "function") {
      throw new Error(
        `Invalid handler for ${method} on ${route}: handler must be a function`
      );
    }

    result[method] = createGuard(config.handler, {
      route,
      method,
      requiredPermissions: config.requiredPermissions || [],
      fallbackPermissions: config.fallbackPermissions || [],
      allowUnauth: config.allowUnauth || false,
    });
  });

  return result;
}
