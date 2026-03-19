import { validateSession } from '@/lib/validateSession';
import { supabaseServer } from '@/lib/supabaseServer';
import { isAdminSession, checkBlacklist } from '@/lib/recruitmentExpandedUtils';

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const view = String(searchParams.get('view') || 'list').trim().toLowerCase();
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

  if (view === 'check') {
    const fullName = String(searchParams.get('full_name') || '').trim();
    const idCardNumber = String(searchParams.get('id_card_number') || '').trim();
    const phone = String(searchParams.get('phone') || '').trim();

    if (!fullName && !idCardNumber && !phone) {
      return Response.json({ error: 'MISSING_SEARCH_PARAMS' }, { status: 400 });
    }

    const { matches, error } = await checkBlacklist({ full_name: fullName, id_card_number: idCardNumber, phone });
    if (error) return Response.json({ error: 'BLACKLIST_CHECK_FAILED', detail: error.message }, { status: 500 });
    return Response.json({ success: true, blacklisted: matches.length > 0, matches });
  }

  const status = String(searchParams.get('status') || 'active').trim().toLowerCase();

  let query = supabaseServer
    .from('blacklist')
    .select('id, full_name, reason_category, severity, blacklisted_date, expiry_date, can_reapply, status, created_at')
    .order('blacklisted_date', { ascending: false })
    .limit(limit);

  if (status !== 'all') query = query.eq('status', status);

  const { data, error } = await query;
  if (error) return Response.json({ error: 'BLACKLIST_QUERY_FAILED', detail: error.message }, { status: 500 });
  return Response.json({ success: true, rows: data || [] });
}

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const body = await req.json();
  const action = String(body.action || 'add').trim().toLowerCase();

  if (action === 'add') {
    const fullName = String(body.full_name || '').trim();
    const reasonCategory = String(body.reason_category || '').trim().toLowerCase();
    const reasonDetail = String(body.reason_detail || '').trim();
    const severity = String(body.severity || 'permanent').trim().toLowerCase();

    if (!fullName || !reasonCategory || !reasonDetail) {
      return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
    }
    if (severity === 'temporary' && !body.expiry_date) {
      return Response.json({ error: 'TEMPORARY_REQUIRES_EXPIRY_DATE' }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from('blacklist')
      .insert({
        full_name: fullName,
        id_card_number: body.id_card_number ? String(body.id_card_number).trim() : null,
        phone: body.phone ? String(body.phone).trim() : null,
        previous_employee_id: body.previous_employee_id || null,
        previous_candidate_id: body.previous_candidate_id || null,
        reason_category: reasonCategory,
        reason_detail: reasonDetail,
        blacklisted_date: body.blacklisted_date || new Date().toISOString().split('T')[0],
        blacklisted_by: session.emp_id,
        severity,
        expiry_date: body.expiry_date ? String(body.expiry_date).trim() : null,
        can_reapply: Boolean(body.can_reapply ?? false),
        evidence_files: body.evidence_files || null,
      })
      .select('*')
      .maybeSingle();

    if (error) return Response.json({ error: 'BLACKLIST_ADD_FAILED', detail: error.message }, { status: 500 });
    return Response.json({ success: true, row: data }, { status: 201 });
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
