/**
 * POST /api/payroll/runs/[id]/calculate
 * Triggers the payroll engine to calculate all items for a run.
 *
 * POST /api/payroll/runs/[id]/approve
 * Approves a run (status: review → approved)
 *
 * POST /api/payroll/runs/[id]/mark-paid
 * Marks a run as paid (status: approved → paid)
 *
 * GET /api/payroll/runs/[id]/items
 * Returns all payroll items for a run
 */
import { validateSession } from '@/lib/validateSession';
import { supabaseServer } from '@/lib/supabaseServer';
import { executeSalaryRun, executeOTRun } from '@/lib/payrollEngine';

export async function GET(req, { params }) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!session.is_admin) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { id } = await params;
  if (!id) return Response.json({ error: 'MISSING_RUN_ID' }, { status: 400 });

  const supabase = supabaseServer;
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  if (action === 'items') {
    const { data, error } = await supabase
      .from('payroll_items')
      .select('*')
      .eq('payroll_run_id', id)
      .order('emp_code');
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ items: data });
  }

  // Default: return the run itself
  const { data: run, error } = await supabase
    .from('payroll_runs')
    .select('*, work_site:work_locations(id, name)')
    .eq('id', id)
    .single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ run });
}

export async function POST(req, { params }) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!session.is_admin) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { id } = await params;
  if (!id) return Response.json({ error: 'MISSING_RUN_ID' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  const supabase = supabaseServer;

  if (action === 'calculate') {
    const { data: run } = await supabase
      .from('payroll_runs')
      .select('run_type')
      .eq('id', id)
      .single();

    if (!run) return Response.json({ error: 'RUN_NOT_FOUND' }, { status: 404 });

    try {
      const createdBy = session.emp_id ?? session.email ?? 'admin';
      let result;
      if (run.run_type === 'salary') {
        result = await executeSalaryRun(id, createdBy);
      } else {
        result = await executeOTRun(id, createdBy);
      }
      return Response.json({ success: true, result });
    } catch (err) {
      console.error('payroll calculate:', err);
      // Reset status on failure
      await supabase
        .from('payroll_runs')
        .update({ status: 'draft', updated_at: new Date().toISOString() })
        .eq('id', id);
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  if (action === 'approve') {
    const { data: run } = await supabase
      .from('payroll_runs')
      .select('status')
      .eq('id', id)
      .single();
    if (!run) return Response.json({ error: 'RUN_NOT_FOUND' }, { status: 404 });
    if (run.status !== 'review') {
      return Response.json({ error: 'RUN_NOT_IN_REVIEW', current: run.status }, { status: 409 });
    }
    await supabase.from('payroll_runs').update({
      status: 'approved',
      approved_by: session.emp_id ?? session.email,
      approved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    return Response.json({ status: 'approved' });
  }

  if (action === 'mark-paid') {
    const { data: run } = await supabase
      .from('payroll_runs')
      .select('status')
      .eq('id', id)
      .single();
    if (!run) return Response.json({ error: 'RUN_NOT_FOUND' }, { status: 404 });
    if (run.status !== 'approved') {
      return Response.json({ error: 'RUN_NOT_APPROVED', current: run.status }, { status: 409 });
    }
    await supabase.from('payroll_runs').update({
      status: 'paid',
      paid_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    return Response.json({ status: 'paid' });
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
