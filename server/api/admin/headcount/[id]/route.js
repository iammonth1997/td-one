import { validateSession } from '@/lib/validateSession';
import { supabaseServer } from '@/lib/supabaseServer';
import {
  isAdminSession,
  canApproveAsManager,
  canApproveAsHR,
  extractIdFromUrl,
} from '@/lib/recruitmentExpandedUtils';

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!canApproveAsManager(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const id = extractIdFromUrl(req);
  if (!id) return Response.json({ error: 'INVALID_ID' }, { status: 400 });

  const { data: hcRequest, error: reqError } = await supabaseServer
    .from('headcount_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (reqError) return Response.json({ error: 'HEADCOUNT_REQUEST_QUERY_FAILED', detail: reqError.message }, { status: 500 });
  if (!hcRequest) return Response.json({ error: 'HEADCOUNT_REQUEST_NOT_FOUND' }, { status: 404 });

  const { data: actions, error: actionsError } = await supabaseServer
    .from('headcount_approval_actions')
    .select('*')
    .eq('request_id', id)
    .order('step_order', { ascending: true });

  if (actionsError) return Response.json({ error: 'APPROVAL_ACTIONS_QUERY_FAILED', detail: actionsError.message }, { status: 500 });

  return Response.json({ success: true, row: hcRequest, approval_actions: actions || [] });
}

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const id = extractIdFromUrl(req);
  if (!id) return Response.json({ error: 'INVALID_ID' }, { status: 400 });

  const body = await req.json();
  const action = String(body.action || '').trim().toLowerCase();
  const comment = body.comment ? String(body.comment).trim() : null;

  const { data: hcRequest, error: reqError } = await supabaseServer
    .from('headcount_requests')
    .select('id, status, current_approval_step, position_title, number_of_positions, department, work_site_id, budget_salary_min, budget_salary_max, job_requirements, employment_type, expected_start_date')
    .eq('id', id)
    .maybeSingle();

  if (reqError) return Response.json({ error: 'HEADCOUNT_REQUEST_QUERY_FAILED', detail: reqError.message }, { status: 500 });
  if (!hcRequest) return Response.json({ error: 'HEADCOUNT_REQUEST_NOT_FOUND' }, { status: 404 });

  if (action === 'approve') {
    const step = hcRequest.current_approval_step;

    if (step === 1) {
      if (!canApproveAsManager(session)) return Response.json({ error: 'FORBIDDEN_STEP1_REQUIRES_MANAGER' }, { status: 403 });
      if (hcRequest.status !== 'pending_manager') return Response.json({ error: 'INVALID_STATUS_FOR_APPROVAL' }, { status: 400 });

      await supabaseServer.from('headcount_approval_actions').insert({
        request_id: id, step_order: 1, approver_role: 'manager',
        approver_emp_id: session.emp_id, action: 'approved', comment,
      });

      const { data, error } = await supabaseServer
        .from('headcount_requests')
        .update({ status: 'pending_hr', current_approval_step: 2, updated_at: new Date().toISOString() })
        .eq('id', id)
        .select('id, status, current_approval_step')
        .maybeSingle();

      if (error) return Response.json({ error: 'HEADCOUNT_REQUEST_UPDATE_FAILED', detail: error.message }, { status: 500 });
      return Response.json({ success: true, row: data });
    }

    if (step === 2) {
      if (!canApproveAsHR(session)) return Response.json({ error: 'FORBIDDEN_STEP2_REQUIRES_HR' }, { status: 403 });
      if (hcRequest.status !== 'pending_hr') return Response.json({ error: 'INVALID_STATUS_FOR_APPROVAL' }, { status: 400 });

      await supabaseServer.from('headcount_approval_actions').insert({
        request_id: id, step_order: 2, approver_role: 'hr',
        approver_emp_id: session.emp_id, action: 'approved', comment,
      });

      // Auto-create recruitment_requisition (draft)
      const year = new Date().getFullYear();
      const { count: existingCount } = await supabaseServer
        .from('recruitment_requisitions')
        .select('id', { count: 'exact', head: true });
      const jobCode = `HC-AUTO-${year}-${String((existingCount ?? 0) + 1).padStart(4, '0')}`;

      const { data: requisition, error: reqCreateError } = await supabaseServer
        .from('recruitment_requisitions')
        .insert({
          job_code: jobCode,
          title: hcRequest.position_title,
          department: hcRequest.department,
          headcount: hcRequest.number_of_positions,
          employment_type: hcRequest.employment_type,
          status: 'draft',
          description: hcRequest.job_requirements,
          created_by: session.emp_id,
        })
        .select('id')
        .maybeSingle();

      if (reqCreateError) return Response.json({ error: 'REQUISITION_AUTO_CREATE_FAILED', detail: reqCreateError.message }, { status: 500 });

      const { data, error } = await supabaseServer
        .from('headcount_requests')
        .update({
          status: 'approved',
          current_approval_step: 3,
          approved_at: new Date().toISOString(),
          requisition_id: requisition?.id || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('id, status, approved_at, requisition_id')
        .maybeSingle();

      if (error) return Response.json({ error: 'HEADCOUNT_REQUEST_UPDATE_FAILED', detail: error.message }, { status: 500 });
      return Response.json({ success: true, row: data, auto_created_requisition_id: requisition?.id || null });
    }

    return Response.json({ error: 'ALREADY_FULLY_APPROVED' }, { status: 400 });
  }

  if (action === 'reject') {
    if (!canApproveAsManager(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });
    if (!['pending_manager', 'pending_hr'].includes(hcRequest.status)) {
      return Response.json({ error: 'INVALID_STATUS_FOR_REJECTION' }, { status: 400 });
    }

    const step = hcRequest.current_approval_step;
    await supabaseServer.from('headcount_approval_actions').insert({
      request_id: id,
      step_order: step,
      approver_role: step === 1 ? 'manager' : 'hr',
      approver_emp_id: session.emp_id,
      action: 'rejected',
      comment,
    });

    const { data, error } = await supabaseServer
      .from('headcount_requests')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, status')
      .maybeSingle();

    if (error) return Response.json({ error: 'HEADCOUNT_REQUEST_UPDATE_FAILED', detail: error.message }, { status: 500 });
    return Response.json({ success: true, row: data });
  }

  if (action === 'cancel') {
    if (!isAdminSession(session)) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

    const { data, error } = await supabaseServer
      .from('headcount_requests')
      .update({ status: 'cancelled', updated_at: new Date().toISOString() })
      .eq('id', id)
      .in('status', ['pending_manager', 'pending_hr'])
      .select('id, status')
      .maybeSingle();

    if (error) return Response.json({ error: 'HEADCOUNT_REQUEST_UPDATE_FAILED', detail: error.message }, { status: 500 });
    if (!data) return Response.json({ error: 'HEADCOUNT_REQUEST_NOT_FOUND_OR_CANNOT_CANCEL' }, { status: 404 });
    return Response.json({ success: true, row: data });
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
