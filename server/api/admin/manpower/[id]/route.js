import { validateSession } from '@/lib/validateSession';
import { getPrisma } from "@/lib/prisma";
import { isAdminSession, extractIdFromUrl } from '@/lib/recruitmentExpandedUtils';

export async function GET(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const id = extractIdFromUrl(req);
  if (!id) return Response.json({ error: 'INVALID_ID' }, { status: 400 });

  try {
    const plan = await prisma.manpowerPlan.findUnique({ where: { id } });
    if (!plan) return Response.json({ error: 'MANPOWER_PLAN_NOT_FOUND' }, { status: 404 });

    const items = await prisma.manpowerPlanItem.findMany({
      where: { plan_id: id },
      orderBy: [{ department: 'asc' }, { position_title: 'asc' }],
    });

    const enrichedItems = (items || []).map((item) => ({
      ...item,
      gap: item.planned_headcount - item.current_headcount,
    }));

    const summary = {
      total_planned: enrichedItems.reduce((s, i) => s + i.planned_headcount, 0),
      total_current: enrichedItems.reduce((s, i) => s + i.current_headcount, 0),
      total_gap: enrichedItems.reduce((s, i) => s + i.gap, 0),
      critical_gap_items: enrichedItems.filter((i) => i.gap > 0 && i.priority === 'critical').length,
    };

    return Response.json({ success: true, plan, items: enrichedItems, summary });
  } catch (err) {
    return Response.json({ error: 'MANPOWER_PLAN_QUERY_FAILED', detail: err.message }, { status: 500 });
  }
}

export async function PUT(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const id = extractIdFromUrl(req);
  if (!id) return Response.json({ error: 'INVALID_ID' }, { status: 400 });

  const body = await req.json();
  const action = String(body.action || 'update').trim().toLowerCase();

  if (action === 'set_status') {
    const validStatuses = ['draft', 'approved', 'active', 'closed'];
    const status = String(body.status || '').trim().toLowerCase();
    if (!validStatuses.includes(status)) return Response.json({ error: 'INVALID_STATUS' }, { status: 400 });

    const patch = { status };
    if (status === 'approved') {
      patch.approved_by = session.emp_id;
      patch.approved_at = new Date();
    }

    try {
      const data = await prisma.manpowerPlan.update({ where: { id }, data: patch });
      return Response.json({ success: true, row: data });
    } catch (err) {
      if (err?.code === 'P2025') return Response.json({ error: 'MANPOWER_PLAN_NOT_FOUND' }, { status: 404 });
      return Response.json({ error: 'MANPOWER_PLAN_UPDATE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  if (action === 'update_item') {
    const itemId = String(body.item_id || '').trim();
    if (!itemId) return Response.json({ error: 'MISSING_ITEM_ID' }, { status: 400 });

    const patch = {};
    if (body.planned_headcount != null) {
      const hc = Number(body.planned_headcount);
      if (!Number.isInteger(hc) || hc <= 0) return Response.json({ error: 'INVALID_HEADCOUNT' }, { status: 400 });
      patch.planned_headcount = hc;
    }
    if (body.current_headcount != null) patch.current_headcount = Math.max(0, Number(body.current_headcount));
    if (body.status != null) patch.status = String(body.status).trim().toLowerCase();
    if (body.priority != null) patch.priority = String(body.priority).trim().toLowerCase();

    if (!Object.keys(patch).length) return Response.json({ error: 'NO_CHANGES' }, { status: 400 });

    try {
      // Ensure item belongs to this plan
      const existing = await prisma.manpowerPlanItem.findFirst({ where: { id: itemId, plan_id: id } });
      if (!existing) return Response.json({ error: 'MANPOWER_PLAN_ITEM_NOT_FOUND' }, { status: 404 });

      const data = await prisma.manpowerPlanItem.update({ where: { id: itemId }, data: patch });
      return Response.json({ success: true, row: { ...data, gap: data.planned_headcount - data.current_headcount } });
    } catch (err) {
      if (err?.code === 'P2025') return Response.json({ error: 'MANPOWER_PLAN_ITEM_NOT_FOUND' }, { status: 404 });
      return Response.json({ error: 'MANPOWER_PLAN_ITEM_UPDATE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
