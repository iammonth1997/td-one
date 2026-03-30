import { validateSession } from '@/lib/validateSession';
import { getPrisma } from "@/lib/prisma";
import { isAdminSession, extractIdFromUrl } from '@/lib/recruitmentExpandedUtils';

export async function GET(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const id = extractIdFromUrl(req);
  if (!id) return Response.json({ error: 'INVALID_ID' }, { status: 400 });

  try {
    const erCase = await prisma.hrErCase.findUnique({ where: { id } });
    if (!erCase) return Response.json({ error: 'HR_ER_CASE_NOT_FOUND' }, { status: 404 });

    const notes = await prisma.hrErCaseNote.findMany({
      where: { case_id: id },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        case_id: true,
        visibility: true,
        note: true,
        created_by: true,
        created_at: true,
      },
    });

    return Response.json({ success: true, row: erCase, notes: notes || [] });
  } catch (err) {
    return Response.json({ error: 'HR_ER_CASE_QUERY_FAILED', detail: err.message }, { status: 500 });
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
  const patch = {};

  if (body.title != null) patch.title = String(body.title).trim();
  if (body.detail != null) patch.detail = String(body.detail).trim() || null;
  if (body.severity != null) patch.severity = String(body.severity).trim().toLowerCase();
  if (body.assigned_to != null) patch.assigned_to = String(body.assigned_to).trim() || null;
  if (body.occurred_on != null) patch.occurred_on = String(body.occurred_on).trim() || null;

  if (!Object.keys(patch).length) {
    return Response.json({ error: 'NO_CHANGES' }, { status: 400 });
  }

  try {
    const data = await prisma.hrErCase.update({ where: { id }, data: patch });
    return Response.json({ success: true, row: data });
  } catch (err) {
    if (err?.code === 'P2025') return Response.json({ error: 'HR_ER_CASE_NOT_FOUND' }, { status: 404 });
    return Response.json({ error: 'HR_ER_CASE_UPDATE_FAILED', detail: err.message }, { status: 500 });
  }
}
