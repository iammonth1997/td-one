import { validateSession } from '@/lib/validateSession';
import { getPrisma } from "@/lib/prisma";

const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'];

function isAdminSession(session) {
  return Boolean(session?.is_admin || session?.role === 'admin' || session?.role === 'super_admin');
}

export async function GET(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const view = String(searchParams.get('view') || 'requisitions').trim().toLowerCase();
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

  if (view === 'candidates') {
    const requisitionId = String(searchParams.get('requisition_id') || '').trim();
    const stage = String(searchParams.get('stage') || '').trim().toLowerCase();

    const where = {};
    if (requisitionId) where.requisition_id = requisitionId;
    if (stage) where.current_stage = stage;

    try {
      const data = await prisma.recruitmentCandidate.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: limit,
        select: {
          id: true,
          requisition_id: true,
          full_name: true,
          email: true,
          phone: true,
          source: true,
          current_stage: true,
          expected_salary: true,
          applied_at: true,
          hired_at: true,
          rejected_reason: true,
          notes: true,
          created_at: true,
          updated_at: true,
        },
      });
      return Response.json({ success: true, view: 'candidates', rows: data || [] });
    } catch (err) {
      return Response.json({ error: 'RECRUITMENT_CANDIDATES_QUERY_FAILED', detail: err.message }, { status: 500 });
    }
  }

  const status = String(searchParams.get('status') || '').trim().toLowerCase();
  const department = String(searchParams.get('department') || '').trim();

  const where = {};
  if (status) where.status = status;
  if (department) where.department = department;

  try {
    const data = await prisma.recruitmentRequisition.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: limit,
      select: {
        id: true,
        job_code: true,
        title: true,
        department: true,
        headcount: true,
        employment_type: true,
        status: true,
        target_start_date: true,
        opened_at: true,
        closed_at: true,
        description: true,
        created_by: true,
        created_at: true,
        updated_at: true,
      },
    });
    return Response.json({ success: true, view: 'requisitions', rows: data || [] });
  } catch (err) {
    return Response.json({ error: 'RECRUITMENT_REQUISITIONS_QUERY_FAILED', detail: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const body = await req.json();
  const action = String(body.action || '').trim().toLowerCase();

  if (action === 'create_requisition') {
    const jobCode = String(body.job_code || '').trim();
    const title = String(body.title || '').trim();
    const department = body.department ? String(body.department).trim() : null;
    const headcount = Number(body.headcount || 1);
    const employmentType = String(body.employment_type || 'full_time').trim().toLowerCase();
    const status = String(body.status || 'draft').trim().toLowerCase();
    const targetStartDate = body.target_start_date ? String(body.target_start_date).trim() : null;
    const description = body.description ? String(body.description).trim() : null;

    if (!jobCode || !title) {
      return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
    }
    if (!Number.isInteger(headcount) || headcount <= 0) {
      return Response.json({ error: 'INVALID_HEADCOUNT' }, { status: 400 });
    }

    try {
      const data = await prisma.recruitmentRequisition.create({
        data: {
          job_code: jobCode,
          title,
          department,
          headcount,
          employment_type: employmentType,
          status,
          target_start_date: targetStartDate,
          description,
          opened_at: status === 'open' ? new Date() : null,
          created_by: session.emp_id,
        },
      });
      return Response.json({ success: true, row: data }, { status: 201 });
    } catch (err) {
      return Response.json({ error: 'RECRUITMENT_REQUISITION_CREATE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  if (action === 'create_candidate') {
    const requisitionId = String(body.requisition_id || '').trim();
    const fullName = String(body.full_name || '').trim();
    const email = body.email ? String(body.email).trim() : null;
    const phone = body.phone ? String(body.phone).trim() : null;
    const source = body.source ? String(body.source).trim() : null;
    const expectedSalary = body.expected_salary != null ? Number(body.expected_salary) : null;
    const notes = body.notes ? String(body.notes).trim() : null;

    if (!requisitionId || !fullName) {
      return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
    }

    try {
      const data = await prisma.recruitmentCandidate.create({
        data: { requisition_id: requisitionId, full_name: fullName, email, phone, source, expected_salary: expectedSalary, notes },
      });
      return Response.json({ success: true, row: data }, { status: 201 });
    } catch (err) {
      return Response.json({ error: 'RECRUITMENT_CANDIDATE_CREATE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  if (action === 'advance_candidate') {
    const candidateId = String(body.candidate_id || '').trim();
    const toStage = String(body.to_stage || '').trim().toLowerCase();
    const interviewer = body.interviewer ? String(body.interviewer).trim() : null;
    const note = body.note ? String(body.note).trim() : null;
    const scheduledAt = body.scheduled_at ? String(body.scheduled_at).trim() : null;
    const score = body.score != null ? Number(body.score) : null;

    if (!candidateId || !toStage) {
      return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
    }
    if (!STAGES.includes(toStage)) {
      return Response.json({ error: 'INVALID_STAGE' }, { status: 400 });
    }

    let existing;
    try {
      existing = await prisma.recruitmentCandidate.findUnique({
        where: { id: candidateId },
        select: { id: true, current_stage: true },
      });
    } catch (err) {
      return Response.json({ error: 'RECRUITMENT_CANDIDATE_QUERY_FAILED', detail: err.message }, { status: 500 });
    }
    if (!existing) return Response.json({ error: 'RECRUITMENT_CANDIDATE_NOT_FOUND' }, { status: 404 });

    try {
      const row = await prisma.recruitmentCandidate.update({
        where: { id: candidateId },
        data: {
          current_stage: toStage,
          hired_at: toStage === 'hired' ? new Date() : null,
        },
      });

      await prisma.recruitmentStageLog.create({
        data: {
          candidate_id: candidateId,
          from_stage: existing.current_stage,
          to_stage: toStage,
          score,
          interviewer,
          note,
          scheduled_at: scheduledAt,
          created_by: session.emp_id,
        },
      });

      return Response.json({ success: true, row });
    } catch (err) {
      return Response.json({ error: 'RECRUITMENT_CANDIDATE_UPDATE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
