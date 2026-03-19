import { validateSession } from '@/lib/validateSession';
import { supabaseServer } from '@/lib/supabaseServer';
import { isAdminSession, extractIdFromUrl } from '@/lib/recruitmentExpandedUtils';

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const id = extractIdFromUrl(req);
  if (!id) return Response.json({ error: 'INVALID_ID' }, { status: 400 });

  const { data: erCase, error: caseError } = await supabaseServer
    .from('hr_er_cases')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (caseError) return Response.json({ error: 'HR_ER_CASE_QUERY_FAILED', detail: caseError.message }, { status: 500 });
  if (!erCase) return Response.json({ error: 'HR_ER_CASE_NOT_FOUND' }, { status: 404 });

  const { data: notes, error: notesError } = await supabaseServer
    .from('hr_er_case_notes')
    .select('id, case_id, visibility, note, created_by, created_at')
    .eq('case_id', id)
    .order('created_at', { ascending: false });

  if (notesError) return Response.json({ error: 'HR_ER_CASE_NOTES_QUERY_FAILED', detail: notesError.message }, { status: 500 });

  return Response.json({ success: true, row: erCase, notes: notes || [] });
}

export async function PUT(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const id = extractIdFromUrl(req);
  if (!id) return Response.json({ error: 'INVALID_ID' }, { status: 400 });

  const body = await req.json();
  const patch = {};

  if (body.title != null) patch.title = String(body.title).trim();
  if (body.detail != null) patch.detail = String(body.detail).trim() || null;
  if (body.severity != null) patch.severity = String(body.severity).trim().toLowerCase();
  if (body.assigned_to != null) patch.assigned_to = String(body.assigned_to).trim() || null;
  if (body.occurred_on != null) patch.occurred_on = String(body.occurred_on).trim() || null;

  if (!Object.keys(patch).length) {
    return Response.json({ error: 'NO_CHANGES' }, { status: 400 });
  }

  patch.updated_at = new Date().toISOString();

  const { data, error } = await supabaseServer
    .from('hr_er_cases')
    .update(patch)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error) return Response.json({ error: 'HR_ER_CASE_UPDATE_FAILED', detail: error.message }, { status: 500 });
  if (!data) return Response.json({ error: 'HR_ER_CASE_NOT_FOUND' }, { status: 404 });

  return Response.json({ success: true, row: data });
}
