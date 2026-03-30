import { validateSession } from '@/lib/validateSession';
import { getPrisma } from "@/lib/prisma";
import { isAdminSession, canApproveAsManager } from '@/lib/recruitmentExpandedUtils';

export async function GET(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!canApproveAsManager(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const view = String(searchParams.get('view') || 'pending').trim().toLowerCase();
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

  const where = {};

  if (view === 'pending') {
    if (isAdminSession(session)) {
      where.status = { in: ['pending_manager', 'pending_hr'] };
    } else {
      where.status = 'pending_manager';
    }
  } else {
    const status = searchParams.get('status');
    if (status) where.status = status;
  }

  try {
    const data = await prisma.headcountRequest.findMany({
      where,
      orderBy: [{ urgency: 'desc' }, { created_at: 'asc' }],
      take: limit,
      select: {
        id: true,
        request_number: true,
        requested_by_emp_code: true,
        department: true,
        position_title: true,
        number_of_positions: true,
        urgency: true,
        reason_type: true,
        status: true,
        current_approval_step: true,
        expected_start_date: true,
        created_at: true,
        updated_at: true,
      },
    });
    return Response.json({ success: true, rows: data || [] });
  } catch (err) {
    return Response.json({ error: 'HEADCOUNT_REQUESTS_QUERY_FAILED', detail: err.message }, { status: 500 });
  }
}
