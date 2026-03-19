import { validateSession } from '@/lib/validateSession';
import { supabaseServer } from '@/lib/supabaseServer';
import { isAdminSession } from '@/lib/recruitmentExpandedUtils';

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const report = String(searchParams.get('report') || 'summary').trim().toLowerCase();
  const year = Number(searchParams.get('year') || new Date().getFullYear());

  if (report === 'summary') {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    const [reqResult, candidateResult, hiredResult, costResult] = await Promise.all([
      supabaseServer.from('recruitment_requisitions').select('id, status').gte('created_at', yearStart).lte('created_at', yearEnd),
      supabaseServer.from('recruitment_candidates').select('id, current_stage').gte('created_at', yearStart).lte('created_at', yearEnd),
      supabaseServer.from('recruitment_candidates').select('id').eq('current_stage', 'hired').gte('created_at', yearStart).lte('created_at', yearEnd),
      supabaseServer.from('recruitment_costs').select('amount, cost_category').eq('budget_year', year),
    ]);

    const statusBreakdown = {};
    for (const req of reqResult.data || []) {
      statusBreakdown[req.status] = (statusBreakdown[req.status] || 0) + 1;
    }

    return Response.json({
      success: true,
      report: 'summary',
      year,
      data: {
        total_requisitions: (reqResult.data || []).length,
        requisitions_by_status: statusBreakdown,
        total_candidates: (candidateResult.data || []).length,
        total_hired: (hiredResult.data || []).length,
        total_recruitment_cost: (costResult.data || []).reduce((s, r) => s + Number(r.amount), 0),
        cost_per_hire: (hiredResult.data || []).length > 0
          ? (costResult.data || []).reduce((s, r) => s + Number(r.amount), 0) / (hiredResult.data || []).length
          : 0,
      },
    });
  }

  if (report === 'manpower') {
    const { data, error } = await supabaseServer
      .from('manpower_plans')
      .select('id, plan_year, plan_name, status, items:manpower_plan_items(department, position_title, planned_headcount, current_headcount, priority, status)')
      .eq('plan_year', year)
      .order('created_at', { ascending: false });

    if (error) return Response.json({ error: 'MANPOWER_REPORT_FAILED', detail: error.message }, { status: 500 });
    return Response.json({ success: true, report: 'manpower', year, data: data || [] });
  }

  if (report === 'cost') {
    const { data, error } = await supabaseServer
      .from('recruitment_costs')
      .select('cost_category, amount, department, cost_date')
      .eq('budget_year', year)
      .order('cost_date', { ascending: false });

    if (error) return Response.json({ error: 'COST_REPORT_FAILED', detail: error.message }, { status: 500 });

    const rows = data || [];
    const byCategory = {};
    const byMonth = {};
    for (const row of rows) {
      byCategory[row.cost_category] = (byCategory[row.cost_category] || 0) + Number(row.amount);
      const month = String(row.cost_date).slice(0, 7);
      byMonth[month] = (byMonth[month] || 0) + Number(row.amount);
    }

    return Response.json({ success: true, report: 'cost', year, data: { rows, by_category: byCategory, by_month: byMonth } });
  }

  if (report === 'source') {
    const { data, error } = await supabaseServer
      .from('recruitment_candidates')
      .select('source, current_stage')
      .gte('created_at', `${year}-01-01`)
      .lte('created_at', `${year}-12-31`);

    if (error) return Response.json({ error: 'SOURCE_REPORT_FAILED', detail: error.message }, { status: 500 });

    const rows = data || [];
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
  }

  return Response.json({ error: 'INVALID_REPORT_TYPE', valid: ['summary', 'manpower', 'cost', 'source'] }, { status: 400 });
}
