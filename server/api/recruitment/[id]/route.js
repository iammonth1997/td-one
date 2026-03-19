import { validateSession } from '@/lib/validateSession';
import { supabaseServer } from '@/lib/supabaseServer';
import { isAdminSession, extractIdFromUrl } from '@/lib/recruitmentExpandedUtils';

const REQUISITION_STATUSES = ['draft', 'open', 'on_hold', 'closed', 'cancelled'];

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const id = extractIdFromUrl(req);
  if (!id) return Response.json({ error: 'INVALID_ID' }, { status: 400 });

  const { data: requisition, error: requisitionError } = await supabaseServer
    .from('recruitment_requisitions')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (requisitionError) return Response.json({ error: 'RECRUITMENT_REQUISITION_QUERY_FAILED', detail: requisitionError.message }, { status: 500 });
  if (!requisition) return Response.json({ error: 'RECRUITMENT_REQUISITION_NOT_FOUND' }, { status: 404 });

  const { data: candidates, error: candidatesError } = await supabaseServer
    .from('recruitment_candidates')
    .select('id, full_name, email, phone, source, current_stage, expected_salary, applied_at, hired_at, rejected_reason, notes, created_at, updated_at')
    .eq('requisition_id', id)
    .order('created_at', { ascending: false });

  if (candidatesError) return Response.json({ error: 'RECRUITMENT_CANDIDATES_QUERY_FAILED', detail: candidatesError.message }, { status: 500 });

  return Response.json({ success: true, requisition, candidates: candidates || [] });
}

export async function PUT(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const id = extractIdFromUrl(req);
  if (!id) return Response.json({ error: 'INVALID_ID' }, { status: 400 });

  const body = await req.json();
  const action = String(body.action || '').trim().toLowerCase();

  if (action === 'set_status') {
    const status = String(body.status || '').trim().toLowerCase();
    if (!REQUISITION_STATUSES.includes(status)) {
      return Response.json({ error: 'INVALID_STATUS' }, { status: 400 });
    }

    const patch = {
      status,
      opened_at: status === 'open' ? new Date().toISOString() : null,
      closed_at: status === 'closed' || status === 'cancelled' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabaseServer
      .from('recruitment_requisitions')
      .update(patch)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) return Response.json({ error: 'RECRUITMENT_REQUISITION_UPDATE_FAILED', detail: error.message }, { status: 500 });
    if (!data) return Response.json({ error: 'RECRUITMENT_REQUISITION_NOT_FOUND' }, { status: 404 });
    return Response.json({ success: true, row: data });
  }

  if (action === 'update') {
    const patch = {};

    if (body.title != null) patch.title = String(body.title).trim();
    if (body.department != null) patch.department = String(body.department).trim();
    if (body.headcount != null) {
      const headcount = Number(body.headcount);
      if (!Number.isInteger(headcount) || headcount <= 0) {
        return Response.json({ error: 'INVALID_HEADCOUNT' }, { status: 400 });
      }
      patch.headcount = headcount;
    }
    if (body.target_start_date != null) patch.target_start_date = String(body.target_start_date).trim() || null;
    if (body.description != null) patch.description = String(body.description).trim() || null;

    if (!Object.keys(patch).length) {
      return Response.json({ error: 'NO_CHANGES' }, { status: 400 });
    }

    patch.updated_at = new Date().toISOString();

    const { data, error } = await supabaseServer
      .from('recruitment_requisitions')
      .update(patch)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) return Response.json({ error: 'RECRUITMENT_REQUISITION_UPDATE_FAILED', detail: error.message }, { status: 500 });
    if (!data) return Response.json({ error: 'RECRUITMENT_REQUISITION_NOT_FOUND' }, { status: 404 });
    return Response.json({ success: true, row: data });
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
