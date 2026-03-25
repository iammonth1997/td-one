import { validateSession } from '@/lib/validateSession';
import prisma from '@/lib/prisma';
import { isAdminSession } from '@/lib/recruitmentExpandedUtils';

const VALID_STATUSES = ['draft', 'approved', 'active', 'closed'];

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const year = Number(searchParams.get('year') || 0) || null;
  const status = String(searchParams.get('status') || '').trim().toLowerCase() || null;
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

  const where = {};
  if (year) where.plan_year = year;
  if (status) where.status = status;

  try {
    const data = await prisma.manpowerPlan.findMany({
      where,
      orderBy: { plan_year: 'desc' },
      take: limit,
      select: {
        id: true,
        plan_year: true,
        plan_name: true,
        status: true,
        approved_by: true,
        approved_at: true,
        notes: true,
        created_by: true,
        created_at: true,
        updated_at: true,
      },
    });
    return Response.json({ success: true, rows: data || [] });
  } catch (err) {
    return Response.json({ error: 'MANPOWER_PLANS_QUERY_FAILED', detail: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const body = await req.json();
  const action = String(body.action || 'create_plan').trim().toLowerCase();

  if (action === 'create_plan') {
    const planYear = Number(body.plan_year);
    const planName = String(body.plan_name || '').trim();
    const notes = body.notes ? String(body.notes).trim() : null;

    if (!planYear || planYear < 2024 || !planName) {
      return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
    }

    try {
      const data = await prisma.manpowerPlan.create({
        data: { plan_year: planYear, plan_name: planName, notes, created_by: session.emp_id },
      });
      return Response.json({ success: true, row: data }, { status: 201 });
    } catch (err) {
      if (err?.code === 'P2002') return Response.json({ error: 'DUPLICATE_PLAN', detail: 'Year + name already exists' }, { status: 409 });
      return Response.json({ error: 'MANPOWER_PLAN_CREATE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  if (action === 'add_item') {
    const planId = String(body.plan_id || '').trim();
    const positionTitle = String(body.position_title || '').trim();
    const plannedHeadcount = Number(body.planned_headcount || 1);

    if (!planId || !positionTitle) {
      return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
    }
    if (!Number.isInteger(plannedHeadcount) || plannedHeadcount <= 0) {
      return Response.json({ error: 'INVALID_HEADCOUNT' }, { status: 400 });
    }

    try {
      const data = await prisma.manpowerPlanItem.create({
        data: {
          plan_id: planId,
          department: body.department ? String(body.department).trim() : null,
          work_site_id: body.work_site_id || null,
          position_title: positionTitle,
          position_level: body.position_level ? String(body.position_level).trim() : null,
          planned_headcount: plannedHeadcount,
          priority: String(body.priority || 'medium').trim().toLowerCase(),
          expected_hire_quarter: body.expected_hire_quarter ? String(body.expected_hire_quarter).toUpperCase() : null,
          estimated_salary_min: body.estimated_salary_min != null ? Number(body.estimated_salary_min) : null,
          estimated_salary_max: body.estimated_salary_max != null ? Number(body.estimated_salary_max) : null,
          justification: body.justification ? String(body.justification).trim() : null,
        },
      });
      return Response.json({ success: true, row: { ...data, gap: plannedHeadcount - 0 } }, { status: 201 });
    } catch (err) {
      return Response.json({ error: 'MANPOWER_PLAN_ITEM_CREATE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  if (action === 'approve') {
    const planId = String(body.plan_id || '').trim();
    if (!planId) return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });

    try {
      // Ensure plan exists and is in draft state
      const existing = await prisma.manpowerPlan.findFirst({ where: { id: planId, status: 'draft' } });
      if (!existing) return Response.json({ error: 'MANPOWER_PLAN_NOT_FOUND_OR_NOT_DRAFT' }, { status: 404 });

      const data = await prisma.manpowerPlan.update({
        where: { id: planId },
        data: { status: 'approved', approved_by: session.emp_id, approved_at: new Date() },
      });
      return Response.json({ success: true, row: data });
    } catch (err) {
      return Response.json({ error: 'MANPOWER_PLAN_APPROVE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
