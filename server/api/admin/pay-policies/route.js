/**
 * GET  /api/admin/pay-policies           – list all site pay policies
 * POST /api/admin/pay-policies           – create or update a pay policy
 * POST /api/admin/pay-policies (action=set_rate)    – upsert a single pay rate
 * POST /api/admin/pay-policies (action=add_holiday) – add a public holiday
 */
import { validateSession } from '@/lib/validateSession';
import prisma from '@/lib/prisma';

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

  const { searchParams } = new URL(req.url);
  const siteId = searchParams.get('site_id');

  try {
    const rows = await prisma.sitePayPolicy.findMany({
      where: siteId ? { work_site_id: siteId } : undefined,
      select: {
        id: true,
        effective_from: true,
        effective_to: true,
        notes: true,
        workSite: {
          select: { id: true, name: true, site_code: true, site_type: true },
        },
        rates: {
          select: {
            id: true,
            pay_type: true,
            multiplier: true,
            fixed_amount: true,
            calculation_method: true,
          },
        },
      },
      orderBy: { effective_from: 'desc' },
    });

    // Rename relation fields to match original Supabase API shape
    const policies = rows.map(({ workSite, rates, ...rest }) => ({
      ...rest,
      work_site:      workSite ?? null,
      site_pay_rates: rates,
    }));

    return Response.json({ policies });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!session.is_admin) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const body = await req.json();
  const action = String(body.action ?? 'create_policy').trim();

  if (action === 'create_policy') {
    const { work_site_id, effective_from, effective_to, notes } = body;
    if (!work_site_id || !effective_from) {
      return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
    }

    try {
      const policy = await prisma.sitePayPolicy.create({
        data: {
          work_site_id,
          effective_from,
          effective_to: effective_to ?? null,
          notes:        notes ?? null,
        },
      });
      return Response.json({ policy }, { status: 201 });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500 });
    }
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

    try {
      const rateData = {
        multiplier:         multiplier ?? null,
        fixed_amount:       fixed_amount ?? null,
        calculation_method: calculation_method ?? 'multiplier',
      };

      const rate = await prisma.sitePayRate.upsert({
        where: {
          site_pay_policy_id_pay_type: {
            site_pay_policy_id: policy_id,
            pay_type,
          },
        },
        create: {
          site_pay_policy_id: policy_id,
          pay_type,
          ...rateData,
        },
        update: rateData,
      });

      return Response.json({ rate }, { status: 200 });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  if (action === 'add_holiday') {
    const { holiday_date, holiday_name, country_code } = body;
    if (!holiday_date || !holiday_name) {
      return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
    }

    try {
      const holiday = await prisma.publicHoliday.create({
        data: {
          holiday_date,
          holiday_name,
          country_code: country_code ?? 'LA',
        },
      });
      return Response.json({ holiday }, { status: 201 });
    } catch (err) {
      if (err.code === 'P2002') {
        return Response.json({ error: 'HOLIDAY_ALREADY_EXISTS' }, { status: 409 });
      }
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
