/**
 * GET /api/admin/requests  — admin view of all pending requests across leave / OT / time-correction
 * ?status=pending|approved|rejected|all  (default: pending)
 * ?type=leave|ot|time_correction|all     (default: all)
 * ?limit=<n>                             (default 100)
 */
import { validateSession } from "@/lib/validateSession";
import prisma from "@/lib/prisma";
import { buildSessionAccessProfile, canManageAdminActions } from "@/lib/rbac/sessionAccess";

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const accessProfile = buildSessionAccessProfile(session);
  if (!canManageAdminActions(session, accessProfile)) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const status       = String(searchParams.get("status") || "pending").toLowerCase();
  const type         = String(searchParams.get("type")   || "all").toLowerCase();
  const limit        = Math.min(Number(searchParams.get("limit") || 100), 500);
  const statusFilter = status === "all" ? undefined : status;

  const results = [];

  // ── Leave requests ────────────────────────────────────────────────────────
  if (type === "all" || type === "leave") {
    try {
      const rows = await prisma.leaveRequest.findMany({
        where: statusFilter ? { status: statusFilter } : undefined,
        select: {
          id:              true,
          employee_id:     true,
          leave_type_code: true,
          start_date:      true,
          end_date:        true,
          total_days:      true,
          reason:          true,
          status:          true,
          created_at:      true,
          employee: { select: { employee_code: true } },
        },
        orderBy: { created_at: "desc" },
        take:    limit,
      });

      for (const r of rows) {
        results.push({
          ...r,
          request_type: "leave",
          emp_code:     r.employee?.employee_code ?? null,
          leave_type:   r.leave_type_code,
        });
      }
    } catch {
      // Partial failure — continue with other types
    }
  }

  // ── OT requests ───────────────────────────────────────────────────────────
  if (type === "all" || type === "ot") {
    try {
      const rows = await prisma.otRequest.findMany({
        where: statusFilter ? { status: statusFilter } : undefined,
        select: {
          id:          true,
          employee_id: true,
          date:        true,
          start_time:  true,
          end_time:    true,
          total_hours: true,
          reason:      true,
          status:      true,
          created_at:  true,
          employee: { select: { employee_code: true } },
        },
        orderBy: { created_at: "desc" },
        take:    limit,
      });

      for (const r of rows) {
        results.push({
          ...r,
          request_type: "ot",
          emp_code:     r.employee?.employee_code ?? null,
          ot_hours:     r.total_hours,
        });
      }
    } catch {
      // Partial failure — continue
    }
  }

  // ── Time-correction requests ──────────────────────────────────────────────
  if (type === "all" || type === "time_correction") {
    try {
      const rows = await prisma.timeCorrectionRequest.findMany({
        where: statusFilter ? { status: statusFilter } : undefined,
        select: {
          id:                 true,
          employee_id:        true,
          date:               true,
          correction_type:    true,
          requested_scan_in:  true,
          requested_scan_out: true,
          reason:             true,
          status:             true,
          created_at:         true,
          employee: { select: { employee_code: true } },
        },
        orderBy: { created_at: "desc" },
        take:    limit,
      });

      for (const r of rows) {
        results.push({
          ...r,
          request_type:    "time_correction",
          emp_code:        r.employee?.employee_code ?? null,
          correction_date: r.date,
        });
      }
    } catch {
      // Partial failure — continue
    }
  }

  // Sort combined results by created_at desc then slice to limit
  results.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return Response.json({ success: true, rows: results.slice(0, limit) });
}
