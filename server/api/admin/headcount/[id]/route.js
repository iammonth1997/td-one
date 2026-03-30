import { validateSession } from '@/lib/validateSession';
import { getPrisma } from "@/lib/prisma";
import {
  isAdminSession,
  canApproveAsManager,
  canApproveAsHR,
  extractIdFromUrl,
} from '@/lib/recruitmentExpandedUtils';

export async function GET(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!canApproveAsManager(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const id = extractIdFromUrl(req);
  if (!id) return Response.json({ error: 'INVALID_ID' }, { status: 400 });

  try {
    const hcRequest = await prisma.headcountRequest.findUnique({ where: { id } });
    if (!hcRequest) return Response.json({ error: 'HEADCOUNT_REQUEST_NOT_FOUND' }, { status: 404 });

    const actions = await prisma.headcountApprovalAction.findMany({
      where: { request_id: id },
      orderBy: { step_order: 'asc' },
    });

    return Response.json({ success: true, row: hcRequest, approval_actions: actions || [] });
  } catch (err) {
    return Response.json({ error: 'HEADCOUNT_REQUEST_QUERY_FAILED', detail: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const id = extractIdFromUrl(req);
  if (!id) return Response.json({ error: 'INVALID_ID' }, { status: 400 });

  const body = await req.json();
  const action = String(body.action || '').trim().toLowerCase();
  const comment = body.comment ? String(body.comment).trim() : null;

  let hcRequest;
  try {
    hcRequest = await prisma.headcountRequest.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        current_approval_step: true,
        position_title: true,
        number_of_positions: true,
        department: true,
        work_site_id: true,
        budget_salary_min: true,
        budget_salary_max: true,
        job_requirements: true,
        employment_type: true,
        expected_start_date: true,
      },
    });
  } catch (err) {
    return Response.json({ error: 'HEADCOUNT_REQUEST_QUERY_FAILED', detail: err.message }, { status: 500 });
  }
  if (!hcRequest) return Response.json({ error: 'HEADCOUNT_REQUEST_NOT_FOUND' }, { status: 404 });

  if (action === 'approve') {
    const step = hcRequest.current_approval_step;

    if (step === 1) {
      if (!canApproveAsManager(session)) return Response.json({ error: 'FORBIDDEN_STEP1_REQUIRES_MANAGER' }, { status: 403 });
      if (hcRequest.status !== 'pending_manager') return Response.json({ error: 'INVALID_STATUS_FOR_APPROVAL' }, { status: 400 });

      try {
        await prisma.headcountApprovalAction.create({
          data: {
            request_id: id,
            step_order: 1,
            approver_role: 'manager',
            approver_emp_id: session.emp_id,
            action: 'approved',
            comment,
          },
        });

        const data = await prisma.headcountRequest.update({
          where: { id },
          data: { status: 'pending_hr', current_approval_step: 2 },
          select: { id: true, status: true, current_approval_step: true },
        });

        return Response.json({ success: true, row: data });
      } catch (err) {
        return Response.json({ error: 'HEADCOUNT_REQUEST_UPDATE_FAILED', detail: err.message }, { status: 500 });
      }
    }

    if (step === 2) {
      if (!canApproveAsHR(session)) return Response.json({ error: 'FORBIDDEN_STEP2_REQUIRES_HR' }, { status: 403 });
      if (hcRequest.status !== 'pending_hr') return Response.json({ error: 'INVALID_STATUS_FOR_APPROVAL' }, { status: 400 });

      try {
        await prisma.headcountApprovalAction.create({
          data: {
            request_id: id,
            step_order: 2,
            approver_role: 'hr',
            approver_emp_id: session.emp_id,
            action: 'approved',
            comment,
          },
        });

        // Auto-create recruitment_requisition (draft)
        const year = new Date().getFullYear();
        const existingCount = await prisma.recruitmentRequisition.count();
        const jobCode = `HC-AUTO-${year}-${String(existingCount + 1).padStart(4, '0')}`;

        const requisition = await prisma.recruitmentRequisition.create({
          data: {
            job_code: jobCode,
            title: hcRequest.position_title,
            department: hcRequest.department,
            headcount: hcRequest.number_of_positions,
            employment_type: hcRequest.employment_type,
            status: 'draft',
            description: hcRequest.job_requirements,
            created_by: session.emp_id,
          },
          select: { id: true },
        });

        const data = await prisma.headcountRequest.update({
          where: { id },
          data: {
            status: 'approved',
            current_approval_step: 3,
            approved_at: new Date(),
            requisition_id: requisition?.id || null,
          },
          select: { id: true, status: true, approved_at: true, requisition_id: true },
        });

        return Response.json({ success: true, row: data, auto_created_requisition_id: requisition?.id || null });
      } catch (err) {
        return Response.json({ error: 'HEADCOUNT_REQUEST_UPDATE_FAILED', detail: err.message }, { status: 500 });
      }
    }

    return Response.json({ error: 'ALREADY_FULLY_APPROVED' }, { status: 400 });
  }

  if (action === 'reject') {
    if (!canApproveAsManager(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
    if (!['pending_manager', 'pending_hr'].includes(hcRequest.status)) {
      return Response.json({ error: 'INVALID_STATUS_FOR_REJECTION' }, { status: 400 });
    }

    const step = hcRequest.current_approval_step;
    try {
      await prisma.headcountApprovalAction.create({
        data: {
          request_id: id,
          step_order: step,
          approver_role: step === 1 ? 'manager' : 'hr',
          approver_emp_id: session.emp_id,
          action: 'rejected',
          comment,
        },
      });

      const data = await prisma.headcountRequest.update({
        where: { id },
        data: { status: 'rejected' },
        select: { id: true, status: true },
      });

      return Response.json({ success: true, row: data });
    } catch (err) {
      return Response.json({ error: 'HEADCOUNT_REQUEST_UPDATE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  if (action === 'cancel') {
    if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

    try {
      // Verify the request exists and is in a cancellable state
      const cancellable = await prisma.headcountRequest.findFirst({
        where: { id, status: { in: ['pending_manager', 'pending_hr'] } },
        select: { id: true },
      });
      if (!cancellable) return Response.json({ error: 'HEADCOUNT_REQUEST_NOT_FOUND_OR_CANNOT_CANCEL' }, { status: 404 });

      const data = await prisma.headcountRequest.update({
        where: { id },
        data: { status: 'cancelled' },
        select: { id: true, status: true },
      });

      return Response.json({ success: true, row: data });
    } catch (err) {
      return Response.json({ error: 'HEADCOUNT_REQUEST_UPDATE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
