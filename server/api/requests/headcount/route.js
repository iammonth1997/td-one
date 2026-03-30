import { validateSession } from '@/lib/validateSession';
import { getPrisma } from "@/lib/prisma";
import {
  canSubmitHeadcountRequest,
  resolveEmployeeId,
  generateHeadcountRequestNumber,
} from '@/lib/recruitmentExpandedUtils';

export async function POST(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!canSubmitHeadcountRequest(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const body = await req.json();
  const positionTitle = String(body.position_title || '').trim();
  const numberOfPositions = Number(body.number_of_positions || 1);
  const reasonType = String(body.reason_type || '').trim().toLowerCase();
  const justification = String(body.justification || '').trim();

  if (!positionTitle || !reasonType || !justification) {
    return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
  }
  if (!Number.isInteger(numberOfPositions) || numberOfPositions <= 0) {
    return Response.json({ error: 'INVALID_NUMBER_OF_POSITIONS' }, { status: 400 });
  }

  const { employee, error: empError } = await resolveEmployeeId(session.emp_id);
  if (empError) return Response.json({ error: 'EMPLOYEE_QUERY_FAILED', detail: empError.message }, { status: 500 });
  if (!employee) return Response.json({ error: 'EMPLOYEE_NOT_FOUND' }, { status: 404 });

  const { requestNumber, error: numError } = await generateHeadcountRequestNumber();
  if (numError) return Response.json({ error: 'REQUEST_NUMBER_GENERATION_FAILED', detail: numError.message }, { status: 500 });

  try {
    const data = await prisma.headcountRequest.create({
      data: {
        request_number: requestNumber,
        requested_by: employee.id,
        requested_by_emp_code: session.emp_id,
        department: body.department ? String(body.department).trim() : null,
        work_site_id: body.work_site_id || null,
        position_title: positionTitle,
        number_of_positions: numberOfPositions,
        employment_type: String(body.employment_type || 'full_time').trim().toLowerCase(),
        urgency: String(body.urgency || 'normal').trim().toLowerCase(),
        reason_type: reasonType,
        replacing_employee_id: body.replacing_employee_id || null,
        justification,
        expected_start_date: body.expected_start_date ? String(body.expected_start_date).trim() : null,
        budget_salary_min: body.budget_salary_min != null ? Number(body.budget_salary_min) : null,
        budget_salary_max: body.budget_salary_max != null ? Number(body.budget_salary_max) : null,
        job_requirements: body.job_requirements ? String(body.job_requirements).trim() : null,
        manpower_plan_item_id: body.manpower_plan_item_id || null,
      },
    });
    return Response.json({ success: true, row: data }, { status: 201 });
  } catch (err) {
    if (err.code === 'P2002') return Response.json({ error: 'DUPLICATE_REQUEST_NUMBER' }, { status: 409 });
    return Response.json({ error: 'HEADCOUNT_REQUEST_CREATE_FAILED', detail: err.message }, { status: 500 });
  }
}

export async function GET(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!canSubmitHeadcountRequest(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { employee, error: empError } = await resolveEmployeeId(session.emp_id);
  if (empError) return Response.json({ error: 'EMPLOYEE_QUERY_FAILED', detail: empError.message }, { status: 500 });
  if (!employee) return Response.json({ success: true, rows: [] });

  const { searchParams } = new URL(req.url);
  const status = String(searchParams.get('status') || '').trim().toLowerCase();
  const limit = Math.min(Number(searchParams.get('limit') || 20), 100);

  const where = { requested_by: employee.id };
  if (status) where.status = status;

  try {
    const rows = await prisma.headcountRequest.findMany({
      where,
      select: {
        id: true, request_number: true, position_title: true, number_of_positions: true,
        urgency: true, status: true, current_approval_step: true, expected_start_date: true,
        created_at: true, updated_at: true,
      },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
    return Response.json({ success: true, rows });
  } catch (err) {
    return Response.json({ error: 'HEADCOUNT_REQUESTS_QUERY_FAILED', detail: err.message }, { status: 500 });
  }
}
