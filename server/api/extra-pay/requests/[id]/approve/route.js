/**
 * POST /api/extra-pay/requests/[id]/approve
 * Body: { action: 'approve'|'reject', notes: string }
 *
 * Approval flow:
 *   pending_supervisor → (approve) → pending_manager
 *   pending_manager    → (approve) → pending_hr
 *   pending_hr         → (approve) → approved
 *   any pending state  → (reject)  → rejected
 *
 * After full approval: record computed pay in extra_pay_records
 */
import { validateSession } from '@/lib/validateSession';
import { supabaseServer } from '@/lib/supabaseServer';
import { calculateExtraPay } from '@/lib/extraPayEngine';

const STATUS_FLOW = {
  pending_supervisor: 'pending_manager',
  pending_manager: 'pending_hr',
  pending_hr: 'approved',
};

const STEP_ORDER = {
  pending_supervisor: 1,
  pending_manager: 2,
  pending_hr: 3,
};

export async function POST(req, { params }) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const { id } = await params;
  if (!id) return Response.json({ error: 'MISSING_ID' }, { status: 400 });

  const body = await req.json();
  const action = String(body.action ?? '').trim().toLowerCase();
  const notes = String(body.notes ?? '').trim();

  if (!['approve', 'reject'].includes(action)) {
    return Response.json({ error: 'INVALID_ACTION' }, { status: 400 });
  }

  const supabase = supabaseServer;

  const { data: request, error: fetchErr } = await supabase
    .from('extra_pay_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !request) {
    return Response.json({ error: 'REQUEST_NOT_FOUND' }, { status: 404 });
  }

  const currentStatus = request.status;
  if (!Object.keys(STATUS_FLOW).includes(currentStatus)) {
    return Response.json({ error: 'REQUEST_NOT_PENDING', current_status: currentStatus }, { status: 409 });
  }

  const newStatus = action === 'approve' ? STATUS_FLOW[currentStatus] : 'rejected';
  const stepOrder = STEP_ORDER[currentStatus];

  // Record approval action
  const { error: actionErr } = await supabase.from('approval_actions').insert({
    request_id: id,
    request_type: 'extra_pay',
    approver_emp_code: session.emp_id,
    step_order: stepOrder,
    action,
    notes: notes ?? null,
  });

  if (actionErr) return Response.json({ error: actionErr.message }, { status: 500 });

  // Update request status
  const updatePayload = { status: newStatus, updated_at: new Date().toISOString() };
  if (action === 'approve' && newStatus === 'approved') {
    updatePayload.final_approved_at = new Date().toISOString();
  } else if (action === 'reject') {
    updatePayload.rejected_at = new Date().toISOString();
    updatePayload.rejected_by = session.emp_id;
  }

  const { error: updateErr } = await supabase
    .from('extra_pay_requests')
    .update(updatePayload)
    .eq('id', id);

  if (updateErr) return Response.json({ error: updateErr.message }, { status: 500 });

  // If fully approved: compute and persist the extra_pay_record
  if (newStatus === 'approved') {
    try {
      const computed = await calculateExtraPay({
        employeeId: request.employee_id,
        workDate: request.work_date,
        clockIn: request.actual_clock_in ?? request.planned_clock_in,
        clockOut: request.actual_clock_out ?? request.planned_clock_out,
        requestType: request.request_type,
      });

      // Insert day and night records separately if both exist
      const recordsToInsert = [];

      if ((computed.dayHours ?? 0) > 0) {
        recordsToInsert.push({
          employee_id: request.employee_id,
          extra_pay_request_id: id,
          work_date: request.work_date,
          pay_type: computed.dayPayType,
          hours: computed.dayHours,
          hourly_rate: computed.hourlyRate,
          multiplier: computed.dayMultiplier,
          amount: computed.dayAmount,
          source: 'approved_request',
          period_month: request.work_date.slice(0, 7),
        });
      }

      if ((computed.nightHours ?? 0) > 0) {
        recordsToInsert.push({
          employee_id: request.employee_id,
          extra_pay_request_id: id,
          work_date: request.work_date,
          pay_type: computed.nightPayType,
          hours: computed.nightHours,
          hourly_rate: computed.hourlyRate,
          multiplier: computed.nightMultiplier,
          amount: computed.nightAmount,
          source: 'approved_request',
          period_month: request.work_date.slice(0, 7),
        });
      }

      if ((computed.nightAllowance ?? 0) > 0) {
        recordsToInsert.push({
          employee_id: request.employee_id,
          extra_pay_request_id: id,
          work_date: request.work_date,
          pay_type: 'NIGHT_ALLOWANCE',
          hours: null,
          hourly_rate: null,
          multiplier: null,
          amount: computed.nightAllowance,
          source: 'approved_request',
          period_month: request.work_date.slice(0, 7),
        });
      }

      if (recordsToInsert.length > 0) {
        await supabase.from('extra_pay_records').insert(recordsToInsert);
      }

      return Response.json({ status: newStatus, computed });
    } catch (calcErr) {
      console.error('extra-pay calculation after approval:', calcErr);
      return Response.json({
        status: newStatus,
        warning: 'CALCULATION_FAILED',
        detail: calcErr.message,
      });
    }
  }

  return Response.json({ status: newStatus });
}
