/**
 * GET  /api/payroll/runs       – list payroll runs (admin)
 * POST /api/payroll/runs       – create a new payroll run (admin)
 */
import { validateSession } from '@/lib/validateSession';
import { getPrisma } from "@/lib/prisma";

export async function GET(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  if (!session.is_admin) {
    return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const runType = searchParams.get('run_type');
  const period  = searchParams.get('period');       // "YYYY-MM"
  const status  = searchParams.get('status');
  const limit   = Math.min(parseInt(searchParams.get('limit') ?? '20', 10), 100);

  const where = {};
  if (runType) where.run_type     = runType;
  if (period)  where.period_month = period;
  if (status)  where.status       = status;

  try {
    const rows = await prisma.payrollRun.findMany({
      where,
      select: {
        id:                  true,
        run_type:            true,
        period_month:        true,
        pay_date:            true,
        status:              true,
        employee_count:      true,
        total_gross:         true,
        total_deductions:    true,
        total_net:           true,
        total_employer_cost: true,
        created_by:          true,
        approved_by:         true,
        approved_at:         true,
        paid_at:             true,
        created_at:          true,
        workSite: {
          select: { id: true, name: true },
        },
      },
      orderBy: { created_at: 'desc' },
      take:    limit,
    });

    // Rename workSite -> work_site for API compatibility
    const runs = rows.map(({ workSite, ...rest }) => ({
      ...rest,
      work_site: workSite ?? null,
    }));

    return Response.json({ runs });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  if (!session.is_admin) {
    return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
  }

  const body        = await req.json();
  const runType     = String(body.run_type     ?? '').trim();
  const periodMonth = String(body.period_month ?? '').trim();
  const payDate     = body.pay_date    ? String(body.pay_date).trim()  : null;
  const workSiteId  = body.work_site_id ?? null;
  const notes       = body.notes       ? String(body.notes).trim()     : null;

  if (!['salary', 'ot_incentive'].includes(runType)) {
    return Response.json({ error: 'INVALID_RUN_TYPE' }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}$/.test(periodMonth)) {
    return Response.json({ error: 'INVALID_PERIOD_MONTH (expect YYYY-MM)' }, { status: 400 });
  }

  try {
    const run = await prisma.payrollRun.create({
      data: {
        run_type:     runType,
        period_month: periodMonth,
        pay_date:     payDate,
        work_site_id: workSiteId,
        notes,
        status:       'draft',
        created_by:   session.emp_id ?? session.email ?? 'admin',
      },
    });
    return Response.json({ run }, { status: 201 });
  } catch (err) {
    if (err.code === 'P2002') {
      return Response.json(
        { error: 'DUPLICATE_RUN', detail: 'A run with same period/type already exists' },
        { status: 409 },
      );
    }
    return Response.json({ error: err.message }, { status: 500 });
  }
}
