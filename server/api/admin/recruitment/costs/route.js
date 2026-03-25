import { validateSession } from '@/lib/validateSession';
import prisma from '@/lib/prisma';
import { isAdminSession } from '@/lib/recruitmentExpandedUtils';

const COST_CATEGORIES = ['advertising', 'candidate_travel', 'agency_fee', 'medical_check', 'training', 'uniform_ppe', 'relocation', 'other'];

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const budgetYear = Number(searchParams.get('budget_year') || new Date().getFullYear());
  const category = String(searchParams.get('category') || '').trim().toLowerCase();
  const requisitionId = String(searchParams.get('requisition_id') || '').trim();
  const limit = Math.min(Number(searchParams.get('limit') || 100), 500);

  const where = { budget_year: budgetYear };
  if (category) where.cost_category = category;
  if (requisitionId) where.requisition_id = requisitionId;

  try {
    const rows = await prisma.recruitmentCost.findMany({
      where,
      orderBy: { cost_date: 'desc' },
      take: limit,
      select: {
        id: true,
        requisition_id: true,
        candidate_id: true,
        cost_category: true,
        description: true,
        amount: true,
        currency: true,
        vendor_name: true,
        cost_date: true,
        budget_year: true,
        department: true,
        work_site_id: true,
        created_by: true,
        created_at: true,
      },
    });

    const totalAmount = rows.reduce((s, r) => s + Number(r.amount), 0);
    const byCategoryMap = {};
    for (const row of rows) {
      byCategoryMap[row.cost_category] = (byCategoryMap[row.cost_category] || 0) + Number(row.amount);
    }

    return Response.json({
      success: true,
      rows,
      summary: { total_amount: totalAmount, budget_year: budgetYear, by_category: byCategoryMap },
    });
  } catch (err) {
    return Response.json({ error: 'RECRUITMENT_COSTS_QUERY_FAILED', detail: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const body = await req.json();
  const costCategory = String(body.cost_category || '').trim().toLowerCase();
  const description = String(body.description || '').trim();
  const amount = Number(body.amount || 0);
  const costDate = String(body.cost_date || '').trim();
  const budgetYear = Number(body.budget_year || new Date().getFullYear());

  if (!costCategory || !description || !costDate) {
    return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
  }
  if (!COST_CATEGORIES.includes(costCategory)) {
    return Response.json({ error: 'INVALID_COST_CATEGORY' }, { status: 400 });
  }
  if (amount <= 0) {
    return Response.json({ error: 'INVALID_AMOUNT' }, { status: 400 });
  }
  if (!budgetYear || budgetYear < 2024) {
    return Response.json({ error: 'INVALID_BUDGET_YEAR' }, { status: 400 });
  }

  try {
    const data = await prisma.recruitmentCost.create({
      data: {
        requisition_id: body.requisition_id || null,
        candidate_id: body.candidate_id || null,
        cost_category: costCategory,
        description,
        amount,
        currency: String(body.currency || 'LAK').trim().toUpperCase(),
        vendor_name: body.vendor_name ? String(body.vendor_name).trim() : null,
        receipt_url: body.receipt_url ? String(body.receipt_url).trim() : null,
        cost_date: costDate,
        budget_year: budgetYear,
        department: body.department ? String(body.department).trim() : null,
        work_site_id: body.work_site_id || null,
        created_by: session.emp_id,
      },
    });
    return Response.json({ success: true, row: data }, { status: 201 });
  } catch (err) {
    return Response.json({ error: 'RECRUITMENT_COST_CREATE_FAILED', detail: err.message }, { status: 500 });
  }
}
