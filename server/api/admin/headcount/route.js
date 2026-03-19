import { validateSession } from '@/lib/validateSession';
import { supabaseServer } from '@/lib/supabaseServer';
import { isAdminSession, canApproveAsManager } from '@/lib/recruitmentExpandedUtils';

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!canApproveAsManager(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const view = String(searchParams.get('view') || 'pending').trim().toLowerCase();
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

  let query = supabaseServer
    .from('headcount_requests')
    .select('id, request_number, requested_by_emp_code, department, position_title, number_of_positions, urgency, reason_type, status, current_approval_step, expected_start_date, created_at, updated_at')
    .order('urgency', { ascending: false })
    .order('created_at', { ascending: true })
    .limit(limit);

  if (view === 'pending') {
    if (isAdminSession(session)) {
      query = query.in('status', ['pending_manager', 'pending_hr']);
    } else {
      query = query.eq('status', 'pending_manager');
    }
  } else {
    const status = searchParams.get('status');
    if (status) query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: 'HEADCOUNT_REQUESTS_QUERY_FAILED', detail: error.message }, { status: 500 });
  return Response.json({ success: true, rows: data || [] });
}
