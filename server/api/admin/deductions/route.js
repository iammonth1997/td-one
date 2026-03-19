/**
 * GET /api/admin/deductions
 * Returns deduction templates and active employee deductions summary.
 */
/**
 * POST /api/admin/deductions  – create a deduction template
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

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!session.is_admin) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  let body;
  try { body = await req.json(); } catch { return Response.json({ error: 'INVALID_JSON' }, { status: 400 }); }

  const { name, name_th, deduction_type, default_amount, default_percentage, applies_to_run_type, auto_apply } = body;
  if (!name || !deduction_type) {
    return Response.json({ error: 'name and deduction_type are required' }, { status: 400 });
  }

  const supabase = supabaseServer;
  const { data: row, error } = await supabase
    .from('deduction_templates')
    .insert({
      name: String(name).trim(),
      name_th: name_th ? String(name_th).trim() : null,
      deduction_type: String(deduction_type).trim(),
      default_amount: default_amount != null ? Number(default_amount) : null,
      default_percentage: default_percentage != null ? Number(default_percentage) : null,
      applies_to_run_type: applies_to_run_type ?? null,
      auto_apply: Boolean(auto_apply ?? false),
      is_active: true,
    })
    .select()
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ template: row }, { status: 201 });
}
