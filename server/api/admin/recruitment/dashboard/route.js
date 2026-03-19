import { validateSession } from '@/lib/validateSession';
import { supabaseServer } from '@/lib/supabaseServer';
import { isAdminSession } from '@/lib/recruitmentExpandedUtils';

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [
    openReqResult,
    candidatesMonthResult,
    pendingHCResult,
    talentPoolResult,
    activeBlacklistResult,
    costYearResult,
    stageCountResult,
  ] = await Promise.all([
    supabaseServer.from('recruitment_requisitions').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress']),
    supabaseServer.from('recruitment_candidates').select('id', { count: 'exact', head: true }).gte('created_at', monthStart),
    supabaseServer.from('headcount_requests').select('id', { count: 'exact', head: true }).in('status', ['pending_manager', 'pending_hr']),
    supabaseServer.from('recruitment_candidates').select('id', { count: 'exact', head: true }).eq('in_talent_pool', true),
    supabaseServer.from('blacklist').select('id', { count: 'exact', head: true }).eq('status', 'active'),
    supabaseServer.from('recruitment_costs').select('amount').eq('budget_year', now.getFullYear()),
    supabaseServer.from('recruitment_candidates').select('current_stage').not('current_stage', 'is', null),
  ]);

  const totalCostThisYear = (costYearResult.data || []).reduce((s, r) => s + Number(r.amount), 0);

  const funnel = {};
  for (const row of stageCountResult.data || []) {
    funnel[row.current_stage] = (funnel[row.current_stage] || 0) + 1;
  }

  return Response.json({
    success: true,
    metrics: {
      open_positions: openReqResult.count || 0,
      applications_this_month: candidatesMonthResult.count || 0,
      pending_headcount_requests: pendingHCResult.count || 0,
      talent_pool_count: talentPoolResult.count || 0,
      active_blacklist_entries: activeBlacklistResult.count || 0,
      total_recruitment_cost_this_year: totalCostThisYear,
    },
    hiring_funnel: funnel,
  });
}
