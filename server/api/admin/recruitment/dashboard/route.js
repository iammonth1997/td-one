import { validateSession } from '@/lib/validateSession';
import prisma from '@/lib/prisma';
import { isAdminSession } from '@/lib/recruitmentExpandedUtils';

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const currentYear = now.getFullYear();

  try {
    const [
      openPositions,
      applicationsThisMonth,
      pendingHeadcount,
      talentPoolCount,
      activeBlacklist,
      costRows,
      stageCandidates,
    ] = await Promise.all([
      prisma.recruitmentRequisition.count({ where: { status: { in: ['open', 'in_progress'] } } }),
      prisma.recruitmentCandidate.count({ where: { created_at: { gte: monthStart } } }),
      prisma.headcountRequest.count({ where: { status: { in: ['pending_manager', 'pending_hr'] } } }),
      prisma.recruitmentCandidate.count({ where: { in_talent_pool: true } }),
      prisma.blacklist.count({ where: { status: 'active' } }),
      prisma.recruitmentCost.findMany({ where: { budget_year: currentYear }, select: { amount: true } }),
      prisma.recruitmentCandidate.findMany({
        where: { current_stage: { not: null } },
        select: { current_stage: true },
      }),
    ]);

    const totalCostThisYear = costRows.reduce((s, r) => s + Number(r.amount), 0);

    const funnel = {};
    for (const row of stageCandidates) {
      if (row.current_stage) {
        funnel[row.current_stage] = (funnel[row.current_stage] || 0) + 1;
      }
    }

    return Response.json({
      success: true,
      metrics: {
        open_positions: openPositions,
        applications_this_month: applicationsThisMonth,
        pending_headcount_requests: pendingHeadcount,
        talent_pool_count: talentPoolCount,
        active_blacklist_entries: activeBlacklist,
        total_recruitment_cost_this_year: totalCostThisYear,
      },
      hiring_funnel: funnel,
    });
  } catch (err) {
    return Response.json({ error: 'DASHBOARD_QUERY_FAILED', detail: err.message }, { status: 500 });
  }
}
