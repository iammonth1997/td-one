/**
 * GET /api/shift
 * Returns the current user's shift schedule (month view).
 * Query params: ?year=2026&month=3
 */
import { validateSession } from '@/lib/validateSession';
import { supabaseServer } from '@/lib/supabaseServer';
import { getEmployeeMonthSchedule, getActiveShiftAssignment } from '@/lib/shiftService';

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const { searchParams } = new URL(req.url);
  const now = new Date();
  const year = parseInt(searchParams.get('year') ?? now.getFullYear(), 10);
  const month = parseInt(searchParams.get('month') ?? now.getMonth() + 1, 10);
  const empCode = searchParams.get('emp_code') ?? session.emp_id;

  if (isNaN(year) || year < 2020 || year > 2100) {
    return Response.json({ error: 'INVALID_YEAR' }, { status: 400 });
  }
  if (isNaN(month) || month < 1 || month > 12) {
    return Response.json({ error: 'INVALID_MONTH' }, { status: 400 });
  }

  const supabase = supabaseServer;

  // Resolve employee UUID from emp_code
  const { data: emp, error: empErr } = await supabase
    .from('employees')
    .select('id')
    .eq('employee_code', empCode)
    .maybeSingle();

  if (empErr || !emp) {
    return Response.json({ error: 'EMPLOYEE_NOT_FOUND' }, { status: 404 });
  }

  try {
    const schedule = await getEmployeeMonthSchedule(emp.id, year, month);
    const assignment = await getActiveShiftAssignment(supabase, emp.id);
    return Response.json({ schedule, assignment, year, month });
  } catch (err) {
    console.error('GET /api/shift:', err);
    return Response.json({ error: 'INTERNAL_ERROR', detail: err.message }, { status: 500 });
  }
}
