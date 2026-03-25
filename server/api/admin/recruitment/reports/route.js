import { validateSession } from '@/lib/validateSession';
import prisma from '@/lib/prisma';
import { isAdminSession } from '@/lib/recruitmentExpandedUtils';

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const report = String(searchParams.get('report') || 'summary').trim().toLowerCase();
  const year = Number(searchParams.get('year') || new Date().getFullYear());

  if (report === 'summary') {
    const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${year}-12-31T23:59:59.999Z`);

    try {
      const [requisitions, candidates, hiredCandidates, costs] = await Promise.all([
        prisma.recruitmentRequisition.findMany({
          where: { created_at: { gte: yearStart, lte: yearEnd } },
          select: { id: true, status: true },
        }),
        prisma.recruitmentCandidate.findMany({
          where: { created_at: { gte: yearStart, lte: yearEnd } },
          select: { id: true, current_stage: true },
        }),
        prisma.recruitmentCandidate.count({
          where: { current_stage: 'hired', created_at: { gte: yearStart, lte: yearEnd } },
        }),
        prisma.recruitmentCost.findMany({
          where: { budget_year: year },
          select: { amount: true, cost_category: true },
        }),
      ]);

      const statusBreakdown = {};
      for (const req of requisitions) {
        statusBreakdown[req.status] = (statusBreakdown[req.status] || 0) + 1;
      }

      const totalCost = costs.reduce((s, r) => s + Number(r.amount), 0);

      return Response.json({
        success: true,
        report: 'summary',
        year,
        data: {
          total_requisitions: requisitions.length,
          requisitions_by_status: statusBreakdown,
          total_candidates: candidates.length,
          total_hired: hiredCandidates,
          total_recruitment_cost: totalCost,
          cost_per_hire: hiredCandidates > 0 ? totalCost / hiredCandidates : 0,
        },
      });
    } catch (err) {
      return Response.json({ error: 'SUMMARY_REPORT_FAILED', detail: err.message }, { status: 500 });
    }
  }

  if (report === 'manpower') {
    try {
      const data = await prisma.manpowerPlan.findMany({
        where: { plan_year: year },
        orderBy: { created_at: 'desc' },
        select: {
          id: true,
          plan_year: true,
          plan_name: true,
          status: true,
          items: {
            select: {
              department: true,
              position_title: true,
              planned_headcount: true,
              current_headcount: true,
              priority: true,
              status: true,
            },
          },
        },
      });
      return Response.json({ success: true, report: 'manpower', year, data: data || [] });
    } catch (err) {
      return Response.json({ error: 'MANPOWER_REPORT_FAILED', detail: err.message }, { status: 500 });
    }
  }

  if (report === 'cost') {
    try {
      const rows = await prisma.recruitmentCost.findMany({
        where: { budget_year: year },
        orderBy: { cost_date: 'desc' },
        select: { cost_category: true, amount: true, department: true, cost_date: true },
      });

      const byCategory = {};
      const byMonth = {};
      for (const row of rows) {
        byCategory[row.cost_category] = (byCategory[row.cost_category] || 0) + Number(row.amount);
        const month = String(row.cost_date).slice(0, 7);
        byMonth[month] = (byMonth[month] || 0) + Number(row.amount);
      }

      return Response.json({ success: true, report: 'cost', year, data: { rows, by_category: byCategory, by_month: byMonth } });
    } catch (err) {
      return Response.json({ error: 'COST_REPORT_FAILED', detail: err.message }, { status: 500 });
    }
  }

  if (report === 'source') {
    const yearStart = new Date(`${year}-01-01T00:00:00.000Z`);
    const yearEnd = new Date(`${year}-12-31T23:59:59.999Z`);

    try {
      const rows = await prisma.recruitmentCandidate.findMany({
        where: { created_at: { gte: yearStart, lte: yearEnd } },
        select: { source: true, current_stage: true },
      });

      const bySource = {};
      for (const row of rows) {
        const src = row.source || 'unknown';
        if (!bySource[src]) bySource[src] = { total: 0, hired: 0 };
        bySource[src].total += 1;
        if (row.current_stage === 'hired') bySource[src].hired += 1;
      }

      const sourceEffectiveness = Object.entries(bySource).map(([source, stats]) => ({
        source,
        total_applications: stats.total,
        total_hired: stats.hired,
        conversion_rate: stats.total > 0 ? Math.round((stats.hired / stats.total) * 100) : 0,
      }));

      return Response.json({ success: true, report: 'source', year, data: sourceEffectiveness });
    } catch (err) {
      return Response.json({ error: 'SOURCE_REPORT_FAILED', detail: err.message }, { status: 500 });
    }
  }

  return Response.json({ error: 'INVALID_REPORT_TYPE', valid: ['summary', 'manpower', 'cost', 'source'] }, { status: 400 });
}
