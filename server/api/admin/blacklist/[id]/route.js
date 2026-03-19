import { validateSession } from '@/lib/validateSession';
import { supabaseServer } from '@/lib/supabaseServer';
import { isAdminSession, extractIdFromUrl } from '@/lib/recruitmentExpandedUtils';

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const id = extractIdFromUrl(req);
  if (!id) return Response.json({ error: 'INVALID_ID' }, { status: 400 });

  const { data, error } = await supabaseServer.from('blacklist').select('*').eq('id', id).maybeSingle();
  if (error) return Response.json({ error: 'BLACKLIST_QUERY_FAILED', detail: error.message }, { status: 500 });
  if (!data) return Response.json({ error: 'BLACKLIST_ENTRY_NOT_FOUND' }, { status: 404 });
  return Response.json({ success: true, row: data });
}

export async function PUT(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const id = extractIdFromUrl(req);
  if (!id) return Response.json({ error: 'INVALID_ID' }, { status: 400 });

  const body = await req.json();
  const action = String(body.action || '').trim().toLowerCase();

  if (action === 'remove') {
    const removedReason = String(body.removed_reason || '').trim();
    if (!removedReason) return Response.json({ error: 'REMOVED_REASON_REQUIRED' }, { status: 400 });

    const { data, error } = await supabaseServer
      .from('blacklist')
      .update({
        status: 'removed',
        removed_by: session.emp_id,
        removed_reason: removedReason,
        removed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('status', 'active')
      .select('*')
      .maybeSingle();

    if (error) return Response.json({ error: 'BLACKLIST_UPDATE_FAILED', detail: error.message }, { status: 500 });
    if (!data) return Response.json({ error: 'BLACKLIST_ENTRY_NOT_FOUND_OR_NOT_ACTIVE' }, { status: 404 });
    return Response.json({ success: true, row: data });
  }

  if (action === 'update') {
    const patch = {};
    if (body.reason_detail != null) patch.reason_detail = String(body.reason_detail).trim();
    if (body.expiry_date != null) patch.expiry_date = String(body.expiry_date).trim() || null;
    if (body.can_reapply != null) patch.can_reapply = Boolean(body.can_reapply);
    if (body.evidence_files != null) patch.evidence_files = body.evidence_files;

    if (!Object.keys(patch).length) return Response.json({ error: 'NO_CHANGES' }, { status: 400 });

    const { data, error } = await supabaseServer
      .from('blacklist')
      .update(patch)
      .eq('id', id)
      .select('*')
      .maybeSingle();

    if (error) return Response.json({ error: 'BLACKLIST_UPDATE_FAILED', detail: error.message }, { status: 500 });
    if (!data) return Response.json({ error: 'BLACKLIST_ENTRY_NOT_FOUND' }, { status: 404 });
    return Response.json({ success: true, row: data });
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
