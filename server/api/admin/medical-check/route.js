import { validateSession } from '@/lib/validateSession';
import { supabaseServer } from '@/lib/supabaseServer';
import { isAdminSession } from '@/lib/recruitmentExpandedUtils';

const VALID_RESULTS = ['fit', 'fit_with_conditions', 'temporarily_unfit', 'permanently_unfit'];

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const view = String(searchParams.get('view') || 'checks').trim().toLowerCase();
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

  if (view === 'types') {
    const { data, error } = await supabaseServer
      .from('medical_check_types')
      .select('*')
      .order('check_name');
    if (error) return Response.json({ error: 'MEDICAL_CHECK_TYPES_QUERY_FAILED', detail: error.message }, { status: 500 });
    return Response.json({ success: true, rows: data || [] });
  }

  const personType = String(searchParams.get('person_type') || '').trim().toLowerCase();
  const result = String(searchParams.get('result') || '').trim().toLowerCase();
  const employeeCode = String(searchParams.get('employee_code') || '').trim().toUpperCase();
  const daysUntilExpiry = Number(searchParams.get('expiring_within_days') || 0);

  let query = supabaseServer
    .from('medical_checks')
    .select('id, person_type, candidate_id, employee_id, check_type_id, check_date, hospital_name, result, conditions, next_check_date, cost, paid_by, created_at')
    .order('check_date', { ascending: false })
    .limit(limit);

  if (personType) query = query.eq('person_type', personType);
  if (result) query = query.eq('result', result);

  if (employeeCode) {
    const { data: emp } = await supabaseServer.from('employees').select('id').eq('employee_code', employeeCode).maybeSingle();
    if (!emp) return Response.json({ success: true, rows: [] });
    query = query.eq('employee_id', emp.id);
  }

  if (daysUntilExpiry > 0) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() + daysUntilExpiry);
    query = query.lte('next_check_date', cutoff.toISOString().split('T')[0]).gte('next_check_date', new Date().toISOString().split('T')[0]);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: 'MEDICAL_CHECKS_QUERY_FAILED', detail: error.message }, { status: 500 });
  return Response.json({ success: true, rows: data || [] });
}

export async function POST(req) {
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

    const nextCheckDate = body.next_check_date ? String(body.next_check_date).trim() : null;

    const { data, error } = await supabaseServer
      .from('medical_checks')
      .insert({
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
        next_check_date: nextCheckDate,
        certificate_url: body.certificate_url ? String(body.certificate_url).trim() : null,
        cost: body.cost != null ? Number(body.cost) : null,
        paid_by: String(body.paid_by || 'company').trim().toLowerCase(),
        created_by: session.emp_id,
      })
      .select('*')
      .maybeSingle();

    if (error) return Response.json({ error: 'MEDICAL_CHECK_CREATE_FAILED', detail: error.message }, { status: 500 });

    return Response.json({ success: true, row: data }, { status: 201 });
  }

  if (action === 'create_type') {
    const checkName = String(body.check_name || '').trim();
    if (!checkName) return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });

    const { data, error } = await supabaseServer
      .from('medical_check_types')
      .insert({
        check_name: checkName,
        is_mandatory_pre_employment: Boolean(body.is_mandatory_pre_employment ?? true),
        is_mandatory_periodic: Boolean(body.is_mandatory_periodic ?? false),
        recurrence_months: body.recurrence_months ? Number(body.recurrence_months) : null,
      })
      .select('*')
      .maybeSingle();

    if (error) {
      if (error.code === '23505') return Response.json({ error: 'DUPLICATE_CHECK_TYPE' }, { status: 409 });
      return Response.json({ error: 'MEDICAL_CHECK_TYPE_CREATE_FAILED', detail: error.message }, { status: 500 });
    }
    return Response.json({ success: true, row: data }, { status: 201 });
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
