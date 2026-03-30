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
    const data = await prisma.blacklist.findUnique({ where: { id } });
    if (!data) return Response.json({ error: 'BLACKLIST_ENTRY_NOT_FOUND' }, { status: 404 });
    return Response.json({ success: true, row: data });
  } catch (err) {
    return Response.json({ error: 'BLACKLIST_QUERY_FAILED', detail: err.message }, { status: 500 });
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

  if (action === 'remove') {
    const removedReason = String(body.removed_reason || '').trim();
    if (!removedReason) return Response.json({ error: 'REMOVED_REASON_REQUIRED' }, { status: 400 });

    try {
      // Ensure the entry is still active before removing
      const existing = await prisma.blacklist.findFirst({ where: { id, status: 'active' } });
      if (!existing) return Response.json({ error: 'BLACKLIST_ENTRY_NOT_FOUND_OR_NOT_ACTIVE' }, { status: 404 });

      const data = await prisma.blacklist.update({
        where: { id },
        data: {
          status: 'removed',
          removed_by: session.emp_id,
          removed_reason: removedReason,
          removed_at: new Date(),
        },
      });
      return Response.json({ success: true, row: data });
    } catch (err) {
      return Response.json({ error: 'BLACKLIST_UPDATE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  if (action === 'update') {
    const patch = {};
    if (body.reason_detail != null) patch.reason_detail = String(body.reason_detail).trim();
    if (body.expiry_date != null) patch.expiry_date = String(body.expiry_date).trim() || null;
    if (body.can_reapply != null) patch.can_reapply = Boolean(body.can_reapply);
    if (body.evidence_files != null) patch.evidence_files = body.evidence_files;

    if (!Object.keys(patch).length) return Response.json({ error: 'NO_CHANGES' }, { status: 400 });

    try {
      const data = await prisma.blacklist.update({ where: { id }, data: patch });
      return Response.json({ success: true, row: data });
    } catch (err) {
      if (err?.code === 'P2025') return Response.json({ error: 'BLACKLIST_ENTRY_NOT_FOUND' }, { status: 404 });
      return Response.json({ error: 'BLACKLIST_UPDATE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
