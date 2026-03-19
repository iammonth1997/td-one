import { validateSession } from '@/lib/validateSession';
import { supabaseServer } from '@/lib/supabaseServer';

const STAGES = ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'];

function isAdminSession(session) {
  return Boolean(session?.is_admin || session?.role === 'admin' || session?.role === 'super_admin');
}

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const view = String(searchParams.get('view') || 'requisitions').trim().toLowerCase();
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200);

  if (view === 'candidates') {
    const requisitionId = String(searchParams.get('requisition_id') || '').trim();
    const stage = String(searchParams.get('stage') || '').trim().toLowerCase();

    let query = supabaseServer
      .from('recruitment_candidates')
      .select('id, requisition_id, full_name, email, phone, source, current_stage, expected_salary, applied_at, hired_at, rejected_reason, notes, created_at, updated_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (requisitionId) query = query.eq('requisition_id', requisitionId);
    if (stage) query = query.eq('current_stage', stage);

    const { data, error } = await query;
    if (error) return Response.json({ error: 'RECRUITMENT_CANDIDATES_QUERY_FAILED', detail: error.message }, { status: 500 });

    return Response.json({ success: true, view: 'candidates', rows: data || [] });
  }

  const status = String(searchParams.get('status') || '').trim().toLowerCase();
  const department = String(searchParams.get('department') || '').trim();

  let query = supabaseServer
    .from('recruitment_requisitions')
    .select('id, job_code, title, department, headcount, employment_type, status, target_start_date, opened_at, closed_at, description, created_by, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (status) query = query.eq('status', status);
  if (department) query = query.eq('department', department);

  const { data, error } = await query;
  if (error) return Response.json({ error: 'RECRUITMENT_REQUISITIONS_QUERY_FAILED', detail: error.message }, { status: 500 });

  return Response.json({ success: true, view: 'requisitions', rows: data || [] });
}

export async function POST(req) {
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

    const openedAt = status === 'open' ? new Date().toISOString() : null;
    const { data, error } = await supabaseServer
      .from('recruitment_requisitions')
      .insert({
        job_code: jobCode,
        title,
        department,
        headcount,
        employment_type: employmentType,
        status,
        target_start_date: targetStartDate,
        description,
        opened_at: openedAt,
        created_by: session.emp_id,
      })
      .select('*')
      .maybeSingle();

    if (error) return Response.json({ error: 'RECRUITMENT_REQUISITION_CREATE_FAILED', detail: error.message }, { status: 500 });
    return Response.json({ success: true, row: data }, { status: 201 });
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

    const { data, error } = await supabaseServer
      .from('recruitment_candidates')
      .insert({
        requisition_id: requisitionId,
        full_name: fullName,
        email,
        phone,
        source,
        expected_salary: expectedSalary,
        notes,
      })
      .select('*')
      .maybeSingle();

    if (error) return Response.json({ error: 'RECRUITMENT_CANDIDATE_CREATE_FAILED', detail: error.message }, { status: 500 });
    return Response.json({ success: true, row: data }, { status: 201 });
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

    const { data: existing, error: existingError } = await supabaseServer
      .from('recruitment_candidates')
      .select('id, current_stage')
      .eq('id', candidateId)
      .maybeSingle();

    if (existingError) return Response.json({ error: 'RECRUITMENT_CANDIDATE_QUERY_FAILED', detail: existingError.message }, { status: 500 });
    if (!existing) return Response.json({ error: 'RECRUITMENT_CANDIDATE_NOT_FOUND' }, { status: 404 });

    const patch = {
      current_stage: toStage,
      hired_at: toStage === 'hired' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    const { data: row, error: updateError } = await supabaseServer
      .from('recruitment_candidates')
      .update(patch)
      .eq('id', candidateId)
      .select('*')
      .maybeSingle();

    if (updateError) return Response.json({ error: 'RECRUITMENT_CANDIDATE_UPDATE_FAILED', detail: updateError.message }, { status: 500 });

    const { error: logError } = await supabaseServer
      .from('recruitment_stage_logs')
      .insert({
        candidate_id: candidateId,
        from_stage: existing.current_stage,
        to_stage: toStage,
        score,
        interviewer,
        note,
        scheduled_at: scheduledAt,
        created_by: session.emp_id,
      });

    if (logError) return Response.json({ error: 'RECRUITMENT_STAGE_LOG_CREATE_FAILED', detail: logError.message }, { status: 500 });

    return Response.json({ success: true, row });
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
