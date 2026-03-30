import { validateSession } from '@/lib/validateSession';
import { getPrisma } from "@/lib/prisma";
import { isAdminSession } from '@/lib/recruitmentExpandedUtils';

const VALID_RESULTS = ['fit', 'fit_with_conditions', 'temporarily_unfit', 'permanently_unfit'];

export async function GET(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const view = String(searchParams.get('view') || 'checks').trim().toLowerCase();
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

  if (view === 'types') {
    try {
      const data = await prisma.medicalCheckType.findMany({ orderBy: { check_name: 'asc' } });
      return Response.json({ success: true, rows: data || [] });
    } catch (err) {
      return Response.json({ error: 'MEDICAL_CHECK_TYPES_QUERY_FAILED', detail: err.message }, { status: 500 });
    }
  }

  const personType = String(searchParams.get('person_type') || '').trim().toLowerCase();
  const result = String(searchParams.get('result') || '').trim().toLowerCase();
  const employeeCode = String(searchParams.get('employee_code') || '').trim().toUpperCase();
  const daysUntilExpiry = Number(searchParams.get('expiring_within_days') || 0);

  const where = {};
  if (personType) where.person_type = personType;
  if (result) where.result = result;

  if (employeeCode) {
    try {
      const emp = await prisma.employee.findFirst({ where: { employee_code: employeeCode }, select: { id: true } });
      if (!emp) return Response.json({ success: true, rows: [] });
      where.employee_id = emp.id;
    } catch (err) {
      return Response.json({ error: 'EMPLOYEE_QUERY_FAILED', detail: err.message }, { status: 500 });
    }
  }

  if (daysUntilExpiry > 0) {
    const today = new Date().toISOString().split('T')[0];
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + daysUntilExpiry);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    where.next_check_date = { gte: today, lte: cutoffStr };
  }

  try {
    const data = await prisma.medicalCheck.findMany({
      where,
      orderBy: { check_date: 'desc' },
      take: limit,
      select: {
        id: true,
        person_type: true,
        candidate_id: true,
        employee_id: true,
        check_type_id: true,
        check_date: true,
        hospital_name: true,
        result: true,
        conditions: true,
        next_check_date: true,
        cost: true,
        paid_by: true,
        created_at: true,
      },
    });
    return Response.json({ success: true, rows: data || [] });
  } catch (err) {
    return Response.json({ error: 'MEDICAL_CHECKS_QUERY_FAILED', detail: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const body = await req.json();
  const action = String(body.action || 'record_check').trim().toLowerCase();

  if (action === 'record_check') {
    const personType = String(body.person_type || '').trim().toLowerCase();
    const checkDate = String(body.check_date || '').trim();
    const hospitalName = String(body.hospital_name || '').trim();
    const result = String(body.result || '').trim().toLowerCase();

    if (!personType || !checkDate || !hospitalName || !result) {
      return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
    }
    if (!['candidate', 'employee'].includes(personType)) {
      return Response.json({ error: 'INVALID_PERSON_TYPE' }, { status: 400 });
    }
    if (!VALID_RESULTS.includes(result)) {
      return Response.json({ error: 'INVALID_RESULT' }, { status: 400 });
    }
    if (personType === 'candidate' && !body.candidate_id) {
      return Response.json({ error: 'MISSING_CANDIDATE_ID' }, { status: 400 });
    }
    if (personType === 'employee' && !body.employee_id) {
      return Response.json({ error: 'MISSING_EMPLOYEE_ID' }, { status: 400 });
    }

    try {
      const data = await prisma.medicalCheck.create({
        data: {
          person_type: personType,
          candidate_id: body.candidate_id || null,
          employee_id: body.employee_id || null,
          check_type_id: body.check_type_id || null,
          check_date: checkDate,
          hospital_name: hospitalName,
          doctor_name: body.doctor_name ? String(body.doctor_name).trim() : null,
          result,
          conditions: body.conditions ? String(body.conditions).trim() : null,
          findings: body.findings ? String(body.findings).trim() : null,
          restrictions: body.restrictions ? String(body.restrictions).trim() : null,
          next_check_date: body.next_check_date ? String(body.next_check_date).trim() : null,
          certificate_url: body.certificate_url ? String(body.certificate_url).trim() : null,
          cost: body.cost != null ? Number(body.cost) : null,
          paid_by: String(body.paid_by || 'company').trim().toLowerCase(),
          created_by: session.emp_id,
        },
      });
      return Response.json({ success: true, row: data }, { status: 201 });
    } catch (err) {
      return Response.json({ error: 'MEDICAL_CHECK_CREATE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  if (action === 'create_type') {
    const checkName = String(body.check_name || '').trim();
    if (!checkName) return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });

    try {
      const data = await prisma.medicalCheckType.create({
        data: {
          check_name: checkName,
          is_mandatory_pre_employment: Boolean(body.is_mandatory_pre_employment ?? true),
          is_mandatory_periodic: Boolean(body.is_mandatory_periodic ?? false),
          recurrence_months: body.recurrence_months ? Number(body.recurrence_months) : null,
        },
      });
      return Response.json({ success: true, row: data }, { status: 201 });
    } catch (err) {
      if (err?.code === 'P2002') return Response.json({ error: 'DUPLICATE_CHECK_TYPE' }, { status: 409 });
      return Response.json({ error: 'MEDICAL_CHECK_TYPE_CREATE_FAILED', detail: err.message }, { status: 500 });
    }
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
