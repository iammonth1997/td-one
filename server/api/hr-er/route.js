import { validateSession } from '@/lib/validateSession';
import { getPrisma } from "@/lib/prisma";

const CASE_TYPES = ['disciplinary', 'grievance', 'safety', 'welfare', 'investigation', 'other'];
const CASE_STATUSES = ['open', 'in_review', 'resolved', 'closed'];

function isAdminSession(session) {
  return Boolean(session?.is_admin || session?.role === 'admin' || session?.role === 'super_admin');
}

function isValidMonth(monthText) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(String(monthText || '').trim());
}

function currentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function resolveEmployeeIdByCode(employeeCode) {
  try {
    const employee = await prisma.employee.findFirst({
      where: { employee_code: employeeCode },
      select: { id: true, employee_code: true },
    });
    return { employee: employee || null, error: null };
  } catch (err) {
    return { employee: null, error: err };
  }
}

export async function GET(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const status = String(searchParams.get('status') || '').trim().toLowerCase();
  const caseType = String(searchParams.get('case_type') || '').trim().toLowerCase();
  const employeeCode = String(searchParams.get('employee_code') || '').trim().toUpperCase();
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

  const where = {};
  if (status) where.status = status;
  if (caseType) where.case_type = caseType;

  if (employeeCode) {
    const { employee, error } = await resolveEmployeeIdByCode(employeeCode);
    if (error) return Response.json({ error: 'EMPLOYEE_QUERY_FAILED', detail: error.message }, { status: 500 });
    if (!employee) return Response.json({ success: true, rows: [] });
    where.employee_id = employee.id;
  }

  try {
    const data = await prisma.hrErCase.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: limit,
      select: {
        id: true,
        employee_id: true,
        case_type: true,
        title: true,
        detail: true,
        severity: true,
        status: true,
        occurred_on: true,
        assigned_to: true,
        opened_by: true,
        resolution_note: true,
        resolved_at: true,
        closed_at: true,
        created_at: true,
        updated_at: true,
      },
    });
    return Response.json({ success: true, rows: data || [] });
  } catch (err) {
    return Response.json({ error: 'HR_ER_CASES_QUERY_FAILED', detail: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const body = await req.json();
  const action = String(body.action || '').trim().toLowerCase();

  if (action === 'create_case') {
    const employeeCode = String(body.employee_code || '').trim().toUpperCase();
    const caseType = String(body.case_type || '').trim().toLowerCase();
    const title = String(body.title || '').trim();
    const detail = body.detail ? String(body.detail).trim() : null;
    const severity = String(body.severity || 'medium').trim().toLowerCase();
    const occurredOn = body.occurred_on ? String(body.occurred_on).trim() : null;
    const assignedTo = body.assigned_to ? String(body.assigned_to).trim() : null;

    if (!employeeCode || !caseType || !title) {
      return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
    }
    if (!CASE_TYPES.includes(caseType)) {
      return Response.json({ error: 'INVALID_CASE_TYPE' }, { status: 400 });
    }

    const { employee, error: employeeError } = await resolveEmployeeIdByCode(employeeCode);
    if (employeeError) return Response.json({ error: 'EMPLOYEE_QUERY_FAILED', detail: employeeError.message }, { status: 500 });
    if (!employee) return Response.json({ error: 'EMPLOYEE_NOT_FOUND' }, { status: 404 });

    try {
      const data = await prisma.hrErCase.create({
        data: {
          employee_id: employee.id,
          case_type: caseType,
          title,
          detail,
          severity,
          occurred_on: occurredOn,
          assigned_to: assignedTo,
          opened_by: session.emp_id,
        },
      });
      return Response.json({ success: true, row: data }, { status: 201 });
    } catch (err) {
      return Response.json({ error: 'HR_ER_CASE_CREATE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  if (action === 'add_note') {
    const caseId = String(body.case_id || '').trim();
    const note = String(body.note || '').trim();
    const visibility = String(body.visibility || 'internal').trim().toLowerCase();

    if (!caseId || !note) {
      return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
    }
    if (!['internal', 'employee'].includes(visibility)) {
      return Response.json({ error: 'INVALID_VISIBILITY' }, { status: 400 });
    }

    try {
      const data = await prisma.hrErCaseNote.create({
        data: { case_id: caseId, visibility, note, created_by: session.emp_id },
      });
      return Response.json({ success: true, row: data }, { status: 201 });
    } catch (err) {
      return Response.json({ error: 'HR_ER_CASE_NOTE_CREATE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  if (action === 'set_status') {
    const caseId = String(body.case_id || '').trim();
    const status = String(body.status || '').trim().toLowerCase();
    const resolutionNote = body.resolution_note ? String(body.resolution_note).trim() : null;

    if (!caseId || !status) {
      return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
    }
    if (!CASE_STATUSES.includes(status)) {
      return Response.json({ error: 'INVALID_STATUS' }, { status: 400 });
    }

    const patch = {
      status,
      resolution_note: resolutionNote,
      resolved_at: status === 'resolved' ? new Date() : null,
      closed_at: status === 'closed' ? new Date() : null,
    };

    try {
      const data = await prisma.hrErCase.update({ where: { id: caseId }, data: patch });
      return Response.json({ success: true, row: data });
    } catch (err) {
      if (err?.code === 'P2025') return Response.json({ error: 'HR_ER_CASE_NOT_FOUND' }, { status: 404 });
      return Response.json({ error: 'HR_ER_CASE_UPDATE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  if (action === 'apply_deduction') {
    const deductionKind = String(body.deduction_kind || '').trim().toLowerCase();
    const caseId = body.case_id ? String(body.case_id).trim() : null;
    const employeeCode = body.employee_code ? String(body.employee_code).trim().toUpperCase() : null;
    const amount = Number(body.amount || 0);
    const startMonth = String(body.start_month || currentMonth()).trim();
    const endMonth = body.end_month ? String(body.end_month).trim() : null;
    const note = body.note ? String(body.note).trim() : null;

    if (!['welfare', 'safety'].includes(deductionKind)) {
      return Response.json({ error: 'INVALID_DEDUCTION_KIND' }, { status: 400 });
    }
    if (amount <= 0) {
      return Response.json({ error: 'INVALID_AMOUNT' }, { status: 400 });
    }
    if (!isValidMonth(startMonth) || (endMonth && !isValidMonth(endMonth))) {
      return Response.json({ error: 'INVALID_MONTH_FORMAT', expected: 'YYYY-MM' }, { status: 400 });
    }

    let employeeId = null;

    if (employeeCode) {
      const { employee, error: employeeError } = await resolveEmployeeIdByCode(employeeCode);
      if (employeeError) return Response.json({ error: 'EMPLOYEE_QUERY_FAILED', detail: employeeError.message }, { status: 500 });
      if (!employee) return Response.json({ error: 'EMPLOYEE_NOT_FOUND' }, { status: 404 });
      employeeId = employee.id;
    }

    if (!employeeId && caseId) {
      try {
        const erCase = await prisma.hrErCase.findUnique({
          where: { id: caseId },
          select: { id: true, employee_id: true },
        });
        if (!erCase) return Response.json({ error: 'HR_ER_CASE_NOT_FOUND' }, { status: 404 });
        employeeId = erCase.employee_id;
      } catch (err) {
        return Response.json({ error: 'HR_ER_CASE_QUERY_FAILED', detail: err.message }, { status: 500 });
      }
    }

    if (!employeeId) {
      return Response.json({ error: 'MISSING_EMPLOYEE_CONTEXT', detail: 'Provide employee_code or case_id with employee_id' }, { status: 400 });
    }

    const customName = deductionKind === 'welfare' ? 'Welfare Deduction' : 'Safety Deduction';
    const notes = [caseId ? `HR-ER case: ${caseId}` : null, note].filter(Boolean).join(' | ') || null;

    try {
      const data = await prisma.employeeDeduction.create({
        data: {
          employee_id: employeeId,
          custom_name: customName,
          amount,
          start_month: startMonth,
          end_month: endMonth,
          notes,
          created_by: session.emp_id,
          is_active: true,
        },
      });

      return Response.json({
        success: true,
        deduction_table: 'employee_deductions',
        row: data,
      }, { status: 201 });
    } catch (err) {
      return Response.json({ error: 'EMPLOYEE_DEDUCTION_CREATE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
