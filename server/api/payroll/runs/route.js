/**
 * GET  /api/payroll/runs       – list payroll runs (admin)
 * POST /api/payroll/runs       – create a new payroll run (admin)
 */
import { validateSession } from '@/lib/validateSession';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  // Admin-only: validate via admin context stored in session
  if (!session.is_admin) {
    return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const supabase = supabaseServer;
  const { searchParams } = new URL(req.url);
  const runType = searchParams.get('run_type');
  const period = searchParams.get('period');         // "YYYY-MM"
  const status = searchParams.get('status');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);

  let q = supabase
    .from('payroll_runs')
    .select(`
      id, run_type, period_month, pay_date, status,
      employee_count, total_gross, total_deductions, total_net, total_employer_cost,
      created_by, approved_by, approved_at, paid_at, created_at,
      work_site:work_locations(id, name)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (runType) q = q.eq('run_type', runType);
  if (period)  q = q.eq('period_month', period);
  if (status)  q = q.eq('status', status);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ runs: data });
}

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  if (!session.is_admin) {
    return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const body = await req.json();
  const runType = String(body.run_type ?? '').trim();
  const periodMonth = String(body.period_month ?? '').trim();
  const payDate = body.pay_date ? String(body.pay_date).trim() : null;
  const workSiteId = body.work_site_id ?? null;
  const notes = body.notes ? String(body.notes).trim() : null;

  if (!['salary', 'ot_incentive'].includes(runType)) {
    return Response.json({ error: 'INVALID_RUN_TYPE' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(periodMonth)) {
    return Response.json({ error: 'INVALID_PERIOD_MONTH (expect YYYY-MM)' }, { status: 400 });
  }

  const supabase = supabaseServer;

  const { data: run, error: insertErr } = await supabase
    .from('payroll_runs')
    .insert({
      run_type: runType,
      period_month: periodMonth,
      pay_date: payDate,
      work_site_id: workSiteId,
      notes,
      status: 'draft',
      created_by: session.emp_id ?? session.email ?? 'admin',
    })
    .select()
    .single();

  if (insertErr) {
    if (insertErr.code === '23505') {
      return Response.json({ error: 'DUPLICATE_RUN', detail: 'A run with same period/type already exists' }, { status: 409 });
    }
    return Response.json({ error: insertErr.message }, { status: 500 });
  }

  return Response.json({ run }, { status: 201 });
}
