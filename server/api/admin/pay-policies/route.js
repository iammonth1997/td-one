/**
 * GET  /api/admin/pay-policies           – list all site pay policies
 * POST /api/admin/pay-policies           – create or update a pay policy
 * POST /api/admin/pay-policies (action=set_rate) – upsert a single pay rate
 */
import { validateSession } from '@/lib/validateSession';
import { supabaseServer } from '@/lib/supabaseServer';

const VALID_PAY_TYPES = [
  'OT_NORMAL_DAY', 'OT_NORMAL_NIGHT',
  'PIECE_WORK_DAY', 'PIECE_WORK_NIGHT',
  'HOLIDAY_DAY', 'HOLIDAY_NIGHT',
  'LUNCH_OT', 'NIGHT_ALLOWANCE',
];

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!session.is_admin) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const supabase = supabaseServer;
  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get('site_id');

  let q = supabase
    .from('site_pay_policies')
    .select(`
      id, effective_from, effective_to, notes,
      work_site:work_locations(id, name, site_code, site_type),
      site_pay_rates(id, pay_type, multiplier, fixed_amount, calculation_method)
    `)
    .order('effective_from', { ascending: false });

  if (siteId) q = q.eq('work_site_id', siteId);

  const { data, error } = await q;
  if (error) return Response.json({ error: error.message }, { status: 500 });

  return Response.json({ policies: data });
}

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!session.is_admin) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const supabase = supabaseServer;
  const body = await req.json();
  const action = String(body.action ?? 'create_policy').trim();

  if (action === 'create_policy') {
    const { work_site_id, effective_from, effective_to, notes } = body;
    if (!work_site_id || !effective_from) {
      return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('site_pay_policies')
      .insert({ work_site_id, effective_from, effective_to: effective_to ?? null, notes: notes ?? null })
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ policy: data }, { status: 201 });
  }

  if (action === 'set_rate') {
    const { policy_id, pay_type, multiplier, fixed_amount, calculation_method } = body;

    if (!policy_id || !pay_type) {
      return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
    }
    if (!VALID_PAY_TYPES.includes(pay_type)) {
      return Response.json({ error: 'INVALID_PAY_TYPE', valid: VALID_PAY_TYPES }, { status: 400 });
    }
    if (multiplier != null && (isNaN(multiplier) || multiplier < 0 || multiplier > 10)) {
      return Response.json({ error: 'INVALID_MULTIPLIER (0–10)' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('site_pay_rates')
      .upsert({
        policy_id,
        pay_type,
        multiplier: multiplier ?? null,
        fixed_amount: fixed_amount ?? null,
        calculation_method: calculation_method ?? 'multiplier',
      }, { onConflict: 'policy_id,pay_type' })
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ rate: data }, { status: 200 });
  }

  if (action === 'add_holiday') {
    const { holiday_date, holiday_name, country_code } = body;
    if (!holiday_date || !holiday_name) {
      return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('public_holidays')
      .insert({ holiday_date, holiday_name, country_code: country_code ?? 'LA' })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') return Response.json({ error: 'HOLIDAY_ALREADY_EXISTS' }, { status: 409 });
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ holiday: data }, { status: 201 });
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
