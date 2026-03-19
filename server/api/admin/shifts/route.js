/**
 * GET  /api/admin/shifts                – list all shift patterns & types
 * POST /api/admin/shifts/assign         – assign a shift to an employee
 * GET  /api/admin/shifts/assign?emp=    – view employee assignments
 */
import { validateSession } from '@/lib/validateSession';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!session.is_admin) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const supabase = supabaseServer;
  const { searchParams } = new URL(req.url);
  const view = searchParams.get('view') ?? 'patterns';

  if (view === 'patterns') {
    const { data: patterns } = await supabase
      .from('shift_patterns')
      .select('*')
      .eq('is_active', true)
      .order('pattern_name');

    const { data: types } = await supabase
      .from('shift_types')
      .select('*')
      .eq('is_active', true)
      .order('type_name');

    return Response.json({ patterns, types });
  }

  if (view === 'assignments') {
    const empCode = searchParams.get('emp');
    let q = supabase
      .from('employee_shift_assignments')
      .select(`
        id, effective_from, effective_to, cycle_start_date,
        employee_id,
        shift_pattern:shift_patterns(pattern_name, work_days, rest_days, work_hours_per_day),
        shift_type:shift_types(type_name, start_time, end_time, is_night_shift)
      `)
      .order('effective_from', { ascending: false });

    if (empCode) {
      const { data: emp } = await supabase
        .from('employees')
        .select('id')
        .eq('employee_code', empCode)
        .maybeSingle();
      if (emp) q = q.eq('employee_id', emp.id);
    }

    const { data } = await q.limit(200);
    return Response.json({ assignments: data });
  }

  return Response.json({ error: 'INVALID_VIEW' }, { status: 400 });
}

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!session.is_admin) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const supabase = supabaseServer;
  const body = await req.json();
  const action = String(body.action ?? 'assign').trim();

  if (action === 'assign') {
    const { emp_code, shift_pattern_id, shift_type_id, cycle_start_date, effective_from, effective_to } = body;
    if (!emp_code || !shift_pattern_id || !shift_type_id || !cycle_start_date || !effective_from) {
      return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
    }

    const { data: emp } = await supabase
      .from('employees')
      .select('id')
      .eq('employee_code', emp_code)
      .maybeSingle();

    if (!emp) return Response.json({ error: 'EMPLOYEE_NOT_FOUND' }, { status: 404 });

    const { data, error } = await supabase
      .from('employee_shift_assignments')
      .insert({
        employee_id: emp.id,
        shift_pattern_id,
        shift_type_id,
        cycle_start_date,
        effective_from,
        effective_to: effective_to ?? null,
        assigned_by: session.emp_id ?? session.email,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23P01') {
        return Response.json({ error: 'OVERLAPPING_ASSIGNMENT' }, { status: 409 });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }

    return Response.json({ assignment: data }, { status: 201 });
  }

  if (action === 'create_pattern') {
    const { pattern_name, work_days, rest_days, work_hours_per_day } = body;
    if (!pattern_name || !work_days || !rest_days) {
      return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('shift_patterns')
      .insert({ pattern_name, work_days, rest_days, work_hours_per_day: work_hours_per_day ?? 8 })
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ pattern: data }, { status: 201 });
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
