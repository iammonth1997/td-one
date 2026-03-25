/**
 * POST /api/extra-pay/requests/[id]/approve
 * Body: { action: 'approve'|'reject', notes: string }
 */
import { validateSession } from '@/lib/validateSession';
import { calculateExtraPay } from '@/lib/extraPayEngine';
import prisma from '@/lib/prisma';

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

  const request = await prisma.extraPayRequest.findUnique({ where: { id } });

  if (!request) {
    return Response.json({ error: 'REQUEST_NOT_FOUND' }, { status: 404 });
  }

  const currentStatus = request.status;
  if (!Object.keys(STATUS_FLOW).includes(currentStatus)) {
    return Response.json({ error: 'REQUEST_NOT_PENDING', current_status: currentStatus }, { status: 409 });
  }

  const newStatus = action === 'approve' ? STATUS_FLOW[currentStatus] : 'rejected';
  const stepOrder = STEP_ORDER[currentStatus];

  await prisma.approvalAction.create({
    data: {
      request_id: id,
      request_type: 'extra_pay',
      approver_emp_code: session.emp_id,
      step_order: stepOrder,
      action,
      notes: notes || null,
    },
  });

  const updateData = { status: newStatus };
  if (action === 'approve' && newStatus === 'approved') {
    updateData.final_approved_at = new Date();
  } else if (action === 'reject') {
    updateData.rejected_at = new Date();
    updateData.rejected_by = session.emp_id;
  }

  await prisma.extraPayRequest.update({ where: { id }, data: updateData });

  if (newStatus === 'approved') {
    try {
      const computed = await calculateExtraPay({
        employeeId: request.employee_id,
        workDate: request.work_date,
        clockIn: request.actual_clock_in ?? request.planned_clock_in,
        clockOut: request.actual_clock_out ?? request.planned_clock_out,
        requestType: request.request_type,
      });

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
        await prisma.extraPayRecord.createMany({ data: recordsToInsert });
      }

      return Response.json({ status: newStatus, computed });
    } catch (calcErr) {
      console.error('extra-pay calculation after approval:', calcErr);
      return Response.json({ status: newStatus, warning: 'CALCULATION_FAILED', detail: calcErr.message });
    }
  }

  return Response.json({ status: newStatus });
}
