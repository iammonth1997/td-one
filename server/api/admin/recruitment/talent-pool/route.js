import { validateSession } from '@/lib/validateSession';
import { getPrisma } from "@/lib/prisma";
import { isAdminSession } from '@/lib/recruitmentExpandedUtils';

export async function GET(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200);
  const tags = String(searchParams.get('tags') || '').trim();
  const minRating = Number(searchParams.get('min_rating') || 0);
  const position = String(searchParams.get('position') || '').trim();

  const where = { in_talent_pool: true };
  if (minRating > 0) where.talent_pool_rating = { gte: minRating };
  if (position) where.position_applied = { contains: position, mode: 'insensitive' };

  try {
    let rows = await prisma.recruitmentCandidate.findMany({
      where,
      orderBy: { talent_pool_rating: 'desc' },
      take: limit,
      select: {
        id: true,
        full_name: true,
        position_applied: true,
        phone: true,
        email: true,
        in_talent_pool: true,
        talent_pool_tags: true,
        talent_pool_rating: true,
        talent_pool_notes: true,
        last_contacted_at: true,
        willing_to_reapply: true,
        talent_pool_added_at: true,
      },
    });

    if (tags) {
      const tagList = tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean);
      rows = rows.filter((r) => {
        const cTags = Array.isArray(r.talent_pool_tags) ? r.talent_pool_tags.map((t) => String(t).toLowerCase()) : [];
        return tagList.some((tag) => cTags.includes(tag));
      });
    }

    return Response.json({ success: true, rows, total: rows.length });
  } catch (err) {
    return Response.json({ error: 'TALENT_POOL_QUERY_FAILED', detail: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const body = await req.json();
  const action = String(body.action || '').trim().toLowerCase();

  if (action === 'add_to_pool') {
    const candidateId = String(body.candidate_id || '').trim();
    if (!candidateId) return Response.json({ error: 'MISSING_CANDIDATE_ID' }, { status: 400 });

    try {
      const existing = await prisma.recruitmentCandidate.findUnique({
        where: { id: candidateId },
        select: { id: true, in_talent_pool: true },
      });
      if (!existing) return Response.json({ error: 'CANDIDATE_NOT_FOUND' }, { status: 404 });
      if (existing.in_talent_pool) return Response.json({ error: 'ALREADY_IN_POOL' }, { status: 409 });

      const rating = body.talent_pool_rating ? Number(body.talent_pool_rating) : null;
      if (rating != null && (rating < 1 || rating > 5)) {
        return Response.json({ error: 'INVALID_RATING_1_TO_5' }, { status: 400 });
      }

      const data = await prisma.recruitmentCandidate.update({
        where: { id: candidateId },
        data: {
          in_talent_pool: true,
          talent_pool_added_at: new Date(),
          talent_pool_tags: body.talent_pool_tags || null,
          talent_pool_rating: rating,
          talent_pool_notes: body.talent_pool_notes ? String(body.talent_pool_notes).trim() : null,
          willing_to_reapply: Boolean(body.willing_to_reapply ?? null),
        },
        select: {
          id: true,
          full_name: true,
          in_talent_pool: true,
          talent_pool_tags: true,
          talent_pool_rating: true,
          talent_pool_added_at: true,
        },
      });
      return Response.json({ success: true, row: data });
    } catch (err) {
      return Response.json({ error: 'TALENT_POOL_ADD_FAILED', detail: err.message }, { status: 500 });
    }
  }

  if (action === 'update_pool') {
    const candidateId = String(body.candidate_id || '').trim();
    if (!candidateId) return Response.json({ error: 'MISSING_CANDIDATE_ID' }, { status: 400 });

    const patch = {};
    if (body.talent_pool_tags != null) patch.talent_pool_tags = body.talent_pool_tags;
    if (body.talent_pool_rating != null) {
      const r = Number(body.talent_pool_rating);
      if (r < 1 || r > 5) return Response.json({ error: 'INVALID_RATING_1_TO_5' }, { status: 400 });
      patch.talent_pool_rating = r;
    }
    if (body.talent_pool_notes != null) patch.talent_pool_notes = String(body.talent_pool_notes).trim() || null;
    if (body.willing_to_reapply != null) patch.willing_to_reapply = Boolean(body.willing_to_reapply);

    if (!Object.keys(patch).length) return Response.json({ error: 'NO_CHANGES' }, { status: 400 });

    try {
      // Ensure candidate is actually in the pool
      const inPool = await prisma.recruitmentCandidate.findFirst({ where: { id: candidateId, in_talent_pool: true } });
      if (!inPool) return Response.json({ error: 'CANDIDATE_NOT_IN_POOL' }, { status: 404 });

      const data = await prisma.recruitmentCandidate.update({
        where: { id: candidateId },
        data: patch,
        select: {
          id: true,
          full_name: true,
          in_talent_pool: true,
          talent_pool_tags: true,
          talent_pool_rating: true,
          talent_pool_notes: true,
        },
      });
      return Response.json({ success: true, row: data });
    } catch (err) {
      return Response.json({ error: 'TALENT_POOL_UPDATE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  if (action === 'remove_from_pool') {
    const candidateId = String(body.candidate_id || '').trim();
    if (!candidateId) return Response.json({ error: 'MISSING_CANDIDATE_ID' }, { status: 400 });

    try {
      const inPool = await prisma.recruitmentCandidate.findFirst({ where: { id: candidateId, in_talent_pool: true } });
      if (!inPool) return Response.json({ error: 'CANDIDATE_NOT_IN_POOL' }, { status: 404 });

      await prisma.recruitmentCandidate.update({
        where: { id: candidateId },
        data: { in_talent_pool: false, talent_pool_added_at: null },
      });
      return Response.json({ success: true });
    } catch (err) {
      return Response.json({ error: 'TALENT_POOL_REMOVE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  if (action === 'contact_log') {
    const candidateId = String(body.candidate_id || '').trim();
    if (!candidateId) return Response.json({ error: 'MISSING_CANDIDATE_ID' }, { status: 400 });

    try {
      const inPool = await prisma.recruitmentCandidate.findFirst({ where: { id: candidateId, in_talent_pool: true } });
      if (!inPool) return Response.json({ error: 'CANDIDATE_NOT_IN_POOL' }, { status: 404 });

      await prisma.recruitmentCandidate.update({
        where: { id: candidateId },
        data: { last_contacted_at: new Date() },
      });
      return Response.json({ success: true });
    } catch (err) {
      return Response.json({ error: 'CONTACT_LOG_FAILED', detail: err.message }, { status: 500 });
    }
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
