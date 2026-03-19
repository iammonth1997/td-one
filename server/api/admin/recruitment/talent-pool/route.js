import { validateSession } from '@/lib/validateSession';
import { supabaseServer } from '@/lib/supabaseServer';
import { isAdminSession } from '@/lib/recruitmentExpandedUtils';

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200);
  const tags = String(searchParams.get('tags') || '').trim();
  const minRating = Number(searchParams.get('min_rating') || 0);
  const position = String(searchParams.get('position') || '').trim();

  let query = supabaseServer
    .from('recruitment_candidates')
    .select('id, full_name, position_applied, phone, email, in_talent_pool, talent_pool_tags, talent_pool_rating, talent_pool_notes, last_contacted_at, willing_to_reapply, talent_pool_added_at')
    .eq('in_talent_pool', true)
    .order('talent_pool_rating', { ascending: false })
    .limit(limit);

  if (minRating > 0) query = query.gte('talent_pool_rating', minRating);
  if (position) query = query.ilike('position_applied', `%${position}%`);

  const { data, error } = await query;
  if (error) return Response.json({ error: 'TALENT_POOL_QUERY_FAILED', detail: error.message }, { status: 500 });

  let rows = data || [];
  if (tags) {
    const tagList = tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
    rows = rows.filter((r) => {
      const cTags = Array.isArray(r.talent_pool_tags) ? r.talent_pool_tags.map((t) => String(t).toLowerCase()) : [];
      return tagList.some((tag) => cTags.includes(tag));
    });
  }

  return Response.json({ success: true, rows, total: rows.length });
}

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const body = await req.json();
  const action = String(body.action || '').trim().toLowerCase();

  if (action === 'add_to_pool') {
    const candidateId = String(body.candidate_id || '').trim();
    if (!candidateId) return Response.json({ error: 'MISSING_CANDIDATE_ID' }, { status: 400 });

    const { data: existing } = await supabaseServer.from('recruitment_candidates').select('id, in_talent_pool').eq('id', candidateId).maybeSingle();
    if (!existing) return Response.json({ error: 'CANDIDATE_NOT_FOUND' }, { status: 404 });
    if (existing.in_talent_pool) return Response.json({ error: 'ALREADY_IN_POOL' }, { status: 409 });

    const rating = body.talent_pool_rating ? Number(body.talent_pool_rating) : null;
    if (rating != null && (rating < 1 || rating > 5)) {
      return Response.json({ error: 'INVALID_RATING_1_TO_5' }, { status: 400 });
    }

    const { data, error } = await supabaseServer
      .from('recruitment_candidates')
      .update({
        in_talent_pool: true,
        talent_pool_added_at: new Date().toISOString(),
        talent_pool_tags: body.talent_pool_tags || null,
        talent_pool_rating: rating,
        talent_pool_notes: body.talent_pool_notes ? String(body.talent_pool_notes).trim() : null,
        willing_to_reapply: Boolean(body.willing_to_reapply ?? null),
      })
      .eq('id', candidateId)
      .select('id, full_name, in_talent_pool, talent_pool_tags, talent_pool_rating, talent_pool_added_at')
      .maybeSingle();

    if (error) return Response.json({ error: 'TALENT_POOL_ADD_FAILED', detail: error.message }, { status: 500 });
    return Response.json({ success: true, row: data });
  }

  if (action === 'update_pool') {
    const candidateId = String(body.candidate_id || '').trim();
    if (!candidateId) return Response.json({ error: 'MISSING_CANDIDATE_ID' }, { status: 400 });

    const patch = {};
    if (body.talent_pool_tags != null) patch.talent_pool_tags = body.talent_pool_tags;
    if (body.talent_pool_rating != null) {
      const r = Number(body.talent_pool_rating);
      if (r < 1 || r > 5) return Response.json({ error: 'INVALID_RATING_1_TO_5' }, { status: 400 });
      patch.talent_pool_rating = r;
    }
    if (body.talent_pool_notes != null) patch.talent_pool_notes = String(body.talent_pool_notes).trim() || null;
    if (body.willing_to_reapply != null) patch.willing_to_reapply = Boolean(body.willing_to_reapply);

    if (!Object.keys(patch).length) return Response.json({ error: 'NO_CHANGES' }, { status: 400 });

    const { data, error } = await supabaseServer.from('recruitment_candidates').update(patch).eq('id', candidateId).eq('in_talent_pool', true).select('id, full_name, in_talent_pool, talent_pool_tags, talent_pool_rating, talent_pool_notes').maybeSingle();
    if (error) return Response.json({ error: 'TALENT_POOL_UPDATE_FAILED', detail: error.message }, { status: 500 });
    if (!data) return Response.json({ error: 'CANDIDATE_NOT_IN_POOL' }, { status: 404 });
    return Response.json({ success: true, row: data });
  }

  if (action === 'remove_from_pool') {
    const candidateId = String(body.candidate_id || '').trim();
    if (!candidateId) return Response.json({ error: 'MISSING_CANDIDATE_ID' }, { status: 400 });

    const { data, error } = await supabaseServer
      .from('recruitment_candidates')
      .update({ in_talent_pool: false, talent_pool_added_at: null })
      .eq('id', candidateId)
      .eq('in_talent_pool', true)
      .select('id')
      .maybeSingle();

    if (error) return Response.json({ error: 'TALENT_POOL_REMOVE_FAILED', detail: error.message }, { status: 500 });
    if (!data) return Response.json({ error: 'CANDIDATE_NOT_IN_POOL' }, { status: 404 });
    return Response.json({ success: true });
  }

  if (action === 'contact_log') {
    const candidateId = String(body.candidate_id || '').trim();
    if (!candidateId) return Response.json({ error: 'MISSING_CANDIDATE_ID' }, { status: 400 });

    const { data, error } = await supabaseServer
      .from('recruitment_candidates')
      .update({ last_contacted_at: new Date().toISOString() })
      .eq('id', candidateId)
      .eq('in_talent_pool', true)
      .select('id')
      .maybeSingle();

    if (error) return Response.json({ error: 'CONTACT_LOG_FAILED', detail: error.message }, { status: 500 });
    if (!data) return Response.json({ error: 'CANDIDATE_NOT_IN_POOL' }, { status: 404 });
    return Response.json({ success: true });
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
