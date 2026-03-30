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
    const data = await prisma.medicalCheck.findUnique({ where: { id } });
    if (!data) return Response.json({ error: 'MEDICAL_CHECK_NOT_FOUND' }, { status: 404 });
    return Response.json({ success: true, row: data });
  } catch (err) {
    return Response.json({ error: 'MEDICAL_CHECK_QUERY_FAILED', detail: err.message }, { status: 500 });
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

  if (body.result != null) {
    const valid = ['fit', 'fit_with_conditions', 'temporarily_unfit', 'permanently_unfit'];
    if (!valid.includes(String(body.result).toLowerCase())) return Response.json({ error: 'INVALID_RESULT' }, { status: 400 });
    patch.result = String(body.result).toLowerCase();
  }
  if (body.conditions != null) patch.conditions = String(body.conditions).trim() || null;
  if (body.findings != null) patch.findings = String(body.findings).trim() || null;
  if (body.restrictions != null) patch.restrictions = String(body.restrictions).trim() || null;
  if (body.next_check_date != null) patch.next_check_date = String(body.next_check_date).trim() || null;
  if (body.certificate_url != null) patch.certificate_url = String(body.certificate_url).trim() || null;
  if (body.cost != null) patch.cost = Number(body.cost);

  if (!Object.keys(patch).length) return Response.json({ error: 'NO_CHANGES' }, { status: 400 });

  try {
    const data = await prisma.medicalCheck.update({ where: { id }, data: patch });
    return Response.json({ success: true, row: data });
  } catch (err) {
    if (err?.code === 'P2025') return Response.json({ error: 'MEDICAL_CHECK_NOT_FOUND' }, { status: 404 });
    return Response.json({ error: 'MEDICAL_CHECK_UPDATE_FAILED', detail: err.message }, { status: 500 });
  }
}
