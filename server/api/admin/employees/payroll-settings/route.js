/**
 * GET  /api/admin/employees/payroll-settings       – list employee payroll settings
 * POST /api/admin/employees/payroll-settings       – create or update settings
 */
import { validateSession } from '@/lib/validateSession';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!session.is_admin) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const supabase = supabaseServer;
  const { searchParams } = new URL(req.url);
  const empCode = searchParams.get('emp_code');
  const siteId = searchParams.get('site_id');

  let q = supabase
    .from('employee_payroll_settings')
    .select(`
      id, emp_code, pay_type, base_salary, daily_rate,
      bank_account_no, bank_name, social_security_no,
      social_security_enrolled, is_active, updated_at,
      work_site:work_locations(id, name, site_code)
    `)
    .eq('is_active', true)
    .order('emp_code');

  if (empCode) q = q.eq('emp_code', empCode);
  if (siteId) q = q.eq('work_site_id', siteId);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ settings: data });
}

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!session.is_admin) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const supabase = supabaseServer;
  const body = await req.json();
  const { emp_code, pay_type, base_salary, daily_rate, work_site_id,
          bank_account_no, bank_name, social_security_no, social_security_enrolled } = body;

  if (!emp_code || !pay_type) {
    return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
  }
  if (!['monthly', 'daily'].includes(pay_type)) {
    return Response.json({ error: 'INVALID_PAY_TYPE' }, { status: 400 });
  }
  if (pay_type === 'monthly' && (!base_salary || base_salary <= 0)) {
    return Response.json({ error: 'BASE_SALARY_REQUIRED_FOR_MONTHLY' }, { status: 400 });
  }
  if (pay_type === 'daily' && (!daily_rate || daily_rate <= 0)) {
    return Response.json({ error: 'DAILY_RATE_REQUIRED_FOR_DAILY' }, { status: 400 });
  }

  // Resolve employee UUID
  const { data: emp } = await supabase
    .from('employees')
    .select('id')
    .eq('employee_code', emp_code)
    .maybeSingle();

  if (!emp) return Response.json({ error: 'EMPLOYEE_NOT_FOUND' }, { status: 404 });

  const { data, error } = await supabase
    .from('employee_payroll_settings')
    .upsert({
      employee_id: emp.id,
      emp_code,
      pay_type,
      base_salary: pay_type === 'monthly' ? base_salary : null,
      daily_rate: pay_type === 'daily' ? daily_rate : null,
      work_site_id: work_site_id ?? null,
      bank_account_no: bank_account_no ?? null,
      bank_name: bank_name ?? null,
      social_security_no: social_security_no ?? null,
      social_security_enrolled: social_security_enrolled ?? true,
      is_active: true,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'employee_id' })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ settings: data }, { status: 200 });
}
