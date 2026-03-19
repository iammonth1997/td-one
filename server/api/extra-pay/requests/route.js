/**
 * GET  /api/extra-pay/requests        – list my extra pay requests
 * POST /api/extra-pay/requests        – create new extra pay request
 */
import { validateSession } from '@/lib/validateSession';
import { supabaseServer } from '@/lib/supabaseServer';
import { calculateExtraPay } from '@/lib/extraPayEngine';

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const supabase = supabaseServer;
  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status');
  const month = searchParams.get('month');  // "YYYY-MM"

  const { data: emp } = await supabase
    .from('employees')
    .select('id')
    .eq('employee_code', session.emp_id)
    .maybeSingle();

  if (!emp) return Response.json({ error: 'EMPLOYEE_NOT_FOUND' }, { status: 404 });

  let q = supabase
    .from('extra_pay_requests')
    .select(`
      id, work_date, request_type, planned_clock_in, planned_clock_out,
      actual_clock_in, actual_clock_out,
      total_hours, reason, status, created_at,
      approval_actions(action, step_order, notes, created_at)
    `)
    .eq('employee_id', emp.id)
    .order('work_date', { ascending: false });

  if (statusFilter) q = q.eq('status', statusFilter);
  if (month) {
    const [y, m] = month.split('-').map(Number);
    const from = `${month}-01`;
    const to = new Date(y, m, 0).toISOString().slice(0, 10);
    q = q.gte('work_date', from).lte('work_date', to);
  }

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ requests: data });
}

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const body = await req.json();
  const workDate = String(body.work_date ?? '').trim();
  const requestType = String(body.request_type ?? 'OT').trim().toUpperCase();
  const clockIn = String(body.planned_clock_in ?? '').trim();
  const clockOut = String(body.planned_clock_out ?? '').trim();
  const reason = String(body.reason ?? '').trim();

  // Validation
  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return Response.json({ error: 'INVALID_DATE' }, { status: 400 });
  }
  if (!['OT', 'PIECE_WORK', 'HOLIDAY', 'LUNCH_OT'].includes(requestType)) {
    return Response.json({ error: 'INVALID_REQUEST_TYPE' }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(clockIn) || !/^\d{2}:\d{2}$/.test(clockOut)) {
    return Response.json({ error: 'INVALID_TIME_FORMAT' }, { status: 400 });
  }
  if (reason.length < 10) {
    return Response.json({ error: 'REASON_TOO_SHORT', min_length: 10 }, { status: 400 });
  }

  // Don't allow future-date manipulation beyond 30 days
  const reqDate = new Date(workDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = (today - reqDate) / 86_400_000;
  if (diffDays > 30) {
    return Response.json({ error: 'DATE_TOO_OLD', max_days_back: 30 }, { status: 400 });
  }

  const supabase = supabaseServer;

  const { data: emp } = await supabase
    .from('employees')
    .select('id')
    .eq('employee_code', session.emp_id)
    .maybeSingle();

  if (!emp) return Response.json({ error: 'EMPLOYEE_NOT_FOUND' }, { status: 404 });

  // Calculate preview amount
  let preview = null;
  try {
    preview = await calculateExtraPay({
      employeeId: emp.id,
      workDate,
      clockIn,
      clockOut,
      requestType,
    });
  } catch {
    // Preview fails silently — no pay policy configured yet
  }

  // Total hours
  const [inH, inM] = clockIn.split(':').map(Number);
  const [outH, outM] = clockOut.split(':').map(Number);
  let totalMinutes = (outH * 60 + outM) - (inH * 60 + inM);
  if (totalMinutes <= 0) totalMinutes += 1440;
  const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

  const { data: created, error: insertErr } = await supabase
    .from('extra_pay_requests')
    .insert({
      employee_id: emp.id,
      work_date: workDate,
      request_type: requestType,
      planned_clock_in: clockIn,
      planned_clock_out: clockOut,
      total_hours: totalHours,
      reason,
      status: 'pending_supervisor',
      preview_amount: preview?.totalAmount ?? null,
    })
    .select()
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      return Response.json({ error: 'DUPLICATE_REQUEST' }, { status: 409 });
    }
    return Response.json({ error: insertErr.message }, { status: 500 });
  }

  return Response.json({ request: created, preview }, { status: 201 });
}
