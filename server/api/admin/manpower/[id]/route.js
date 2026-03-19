import { validateSession } from '@/lib/validateSession';
import { supabaseServer } from '@/lib/supabaseServer';
import { isAdminSession, extractIdFromUrl } from '@/lib/recruitmentExpandedUtils';

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const id = extractIdFromUrl(req);
  if (!id) return Response.json({ error: 'INVALID_ID' }, { status: 400 });

  const { data: plan, error: planError } = await supabaseServer
    .from('manpower_plans')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (planError) return Response.json({ error: 'MANPOWER_PLAN_QUERY_FAILED', detail: planError.message }, { status: 500 });
  if (!plan) return Response.json({ error: 'MANPOWER_PLAN_NOT_FOUND' }, { status: 404 });

  const { data: items, error: itemsError } = await supabaseServer
    .from('manpower_plan_items')
    .select('*')
    .eq('plan_id', id)
    .order('department')
    .order('position_title');

  if (itemsError) return Response.json({ error: 'MANPOWER_PLAN_ITEMS_QUERY_FAILED', detail: itemsError.message }, { status: 500 });

  const enrichedItems = (items || []).map(item => ({
    ...item,
    gap: item.planned_headcount - item.current_headcount,
  }));

  const summary = {
    total_planned: enrichedItems.reduce((s, i) => s + i.planned_headcount, 0),
    total_current: enrichedItems.reduce((s, i) => s + i.current_headcount, 0),
    total_gap: enrichedItems.reduce((s, i) => s + i.gap, 0),
    critical_gap_items: enrichedItems.filter(i => i.gap > 0 && i.priority === 'critical').length,
  };

  return Response.json({ success: true, plan, items: enrichedItems, summary });
}

export async function PUT(req) {
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

    const patch = { status, updated_at: new Date().toISOString() };
    if (status === 'approved') {
      patch.approved_by = session.emp_id;
      patch.approved_at = new Date().toISOString();
    }
    const { data, error } = await supabaseServer.from('manpower_plans').update(patch).eq('id', id).select('*').maybeSingle();
    if (error) return Response.json({ error: 'MANPOWER_PLAN_UPDATE_FAILED', detail: error.message }, { status: 500 });
    if (!data) return Response.json({ error: 'MANPOWER_PLAN_NOT_FOUND' }, { status: 404 });
    return Response.json({ success: true, row: data });
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

    const { data, error } = await supabaseServer
      .from('manpower_plan_items')
      .update(patch)
      .eq('id', itemId)
      .eq('plan_id', id)
      .select('*')
      .maybeSingle();

    if (error) return Response.json({ error: 'MANPOWER_PLAN_ITEM_UPDATE_FAILED', detail: error.message }, { status: 500 });
    if (!data) return Response.json({ error: 'MANPOWER_PLAN_ITEM_NOT_FOUND' }, { status: 404 });
    return Response.json({ success: true, row: { ...data, gap: data.planned_headcount - data.current_headcount } });
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
