import { validateSession } from '@/lib/validateSession';
import { getPrisma } from "@/lib/prisma";
import { isAdminSession, extractIdFromUrl } from '@/lib/recruitmentExpandedUtils';

const REQUISITION_STATUSES = ['draft', 'open', 'on_hold', 'closed', 'cancelled'];

export async function GET(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const id = extractIdFromUrl(req);
  if (!id) return Response.json({ error: 'INVALID_ID' }, { status: 400 });

  try {
    const requisition = await prisma.recruitmentRequisition.findUnique({ where: { id } });
    if (!requisition) return Response.json({ error: 'RECRUITMENT_REQUISITION_NOT_FOUND' }, { status: 404 });

    const candidates = await prisma.recruitmentCandidate.findMany({
      where: { requisition_id: id },
      select: {
        id: true, full_name: true, email: true, phone: true, source: true,
        current_stage: true, expected_salary: true, applied_at: true, hired_at: true,
        rejected_reason: true, notes: true, created_at: true, updated_at: true,
      },
      orderBy: { created_at: 'desc' },
    });

    return Response.json({ success: true, requisition, candidates });
  } catch (err) {
    return Response.json({ error: 'RECRUITMENT_REQUISITION_QUERY_FAILED', detail: err.message }, { status: 500 });
  }
}

export async function PUT(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const id = extractIdFromUrl(req);
  if (!id) return Response.json({ error: 'INVALID_ID' }, { status: 400 });

  const body = await req.json();
  const action = String(body.action || '').trim().toLowerCase();

  if (action === 'set_status') {
    const status = String(body.status || '').trim().toLowerCase();
    if (!REQUISITION_STATUSES.includes(status)) {
      return Response.json({ error: 'INVALID_STATUS' }, { status: 400 });
    }

    try {
      const data = await prisma.recruitmentRequisition.update({
        where: { id },
        data: {
          status,
          opened_at: status === 'open' ? new Date() : null,
          closed_at: (status === 'closed' || status === 'cancelled') ? new Date() : null,
        },
      });
      return Response.json({ success: true, row: data });
    } catch (err) {
      if (err.code === 'P2025') return Response.json({ error: 'RECRUITMENT_REQUISITION_NOT_FOUND' }, { status: 404 });
      return Response.json({ error: 'RECRUITMENT_REQUISITION_UPDATE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  if (action === 'update') {
    const patch = {};
    if (body.title != null) patch.title = String(body.title).trim();
    if (body.department != null) patch.department = String(body.department).trim();
    if (body.headcount != null) {
      const headcount = Number(body.headcount);
      if (!Number.isInteger(headcount) || headcount <= 0) {
        return Response.json({ error: 'INVALID_HEADCOUNT' }, { status: 400 });
      }
      patch.headcount = headcount;
    }
    if (body.target_start_date != null) patch.target_start_date = String(body.target_start_date).trim() || null;
    if (body.description != null) patch.description = String(body.description).trim() || null;

    if (!Object.keys(patch).length) {
      return Response.json({ error: 'NO_CHANGES' }, { status: 400 });
    }

    try {
      const data = await prisma.recruitmentRequisition.update({ where: { id }, data: patch });
      return Response.json({ success: true, row: data });
    } catch (err) {
      if (err.code === 'P2025') return Response.json({ error: 'RECRUITMENT_REQUISITION_NOT_FOUND' }, { status: 404 });
      return Response.json({ error: 'RECRUITMENT_REQUISITION_UPDATE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
