/**
 * GET /api/admin/deductions
 * Returns deduction templates and active employee deductions summary.
 */
import { validateSession } from '@/lib/validateSession';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!session.is_admin) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const supabase = supabaseServer;

  const { data: templates, error: templatesError } = await supabase
    .from('deduction_templates')
    .select('id, name, name_th, deduction_type, default_amount, default_percentage, applies_to_run_type, auto_apply, is_active')
    .order('name');

  if (templatesError) {
    return Response.json({ error: templatesError.message }, { status: 500 });
  }

  const { count: activeCount, error: activeCountError } = await supabase
    .from('employee_deductions')
    .select('id', { count: 'exact', head: true })
    .eq('is_active', true);

  if (activeCountError) {
    return Response.json({ error: activeCountError.message }, { status: 500 });
  }

  return Response.json({
    templates: templates ?? [],
    active_employee_deductions: activeCount ?? 0,
  });
}
