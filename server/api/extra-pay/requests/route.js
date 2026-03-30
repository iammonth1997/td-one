/**
 * GET  /api/extra-pay/requests        – list my extra pay requests
 * POST /api/extra-pay/requests        – create new extra pay request
 */
import { validateSession } from '@/lib/validateSession';
import { getPrisma } from "@/lib/prisma";
import { calculateExtraPay } from '@/lib/extraPayEngine';

export async function GET(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status');
  const month = searchParams.get('month');  // "YYYY-MM"

  const emp = await prisma.employee.findFirst({
    where: { employee_code: session.emp_id },
    select: { id: true },
  });

  if (!emp) return Response.json({ error: 'EMPLOYEE_NOT_FOUND' }, { status: 404 });

  const where = { employee_id: emp.id };
  if (statusFilter) where.status = statusFilter;
  if (month) {
    const [y, m] = month.split('-').map(Number);
    const from = `${month}-01`;
    const to = new Date(y, m, 0).toISOString().slice(0, 10);
    where.work_date = { gte: from, lte: to };
  }

  try {
    const requests = await prisma.extraPayRequest.findMany({
      where,
      select: {
        id: true,
        work_date: true,
        request_type: true,
        planned_clock_in: true,
        planned_clock_out: true,
        actual_clock_in: true,
        actual_clock_out: true,
        total_hours: true,
        reason: true,
        status: true,
        created_at: true,
      },
      orderBy: { work_date: 'desc' },
    });

    // Fetch approval actions separately for each request
    const ids = requests.map(r => r.id);
    const actions = ids.length > 0 ? await prisma.approvalAction.findMany({
      where: { request_id: { in: ids }, request_type: 'extra_pay' },
      select: { request_id: true, action: true, step_order: true, notes: true, created_at: true },
    }) : [];

    const actionsByRequest = {};
    for (const a of actions) {
      if (!actionsByRequest[a.request_id]) actionsByRequest[a.request_id] = [];
      actionsByRequest[a.request_id].push(a);
    }

    const result = requests.map(r => ({
      ...r,
      approval_actions: actionsByRequest[r.id] || [],
    }));

    return Response.json({ requests: result });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });

  const body = await req.json();
  const workDate = String(body.work_date ?? '').trim();
  const requestType = String(body.request_type ?? 'OT').trim().toUpperCase();
  const clockIn = String(body.planned_clock_in ?? '').trim();
  const clockOut = String(body.planned_clock_out ?? '').trim();
  const reason = String(body.reason ?? '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) {
    return Response.json({ error: 'INVALID_DATE' }, { status: 400 });
  }
  if (!['OT', 'PIECE_WORK', 'HOLIDAY', 'LUNCH_OT'].includes(requestType)) {
    return Response.json({ error: 'INVALID_REQUEST_TYPE' }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(clockIn) || !/^\d{2}:\d{2}$/.test(clockOut)) {
    return Response.json({ error: 'INVALID_TIME_FORMAT' }, { status: 400 });
  }
  if (reason.length < 10) {
    return Response.json({ error: 'REASON_TOO_SHORT', min_length: 10 }, { status: 400 });
  }

  const reqDate = new Date(workDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = (today - reqDate) / 86_400_000;
  if (diffDays > 30) {
    return Response.json({ error: 'DATE_TOO_OLD', max_days_back: 30 }, { status: 400 });
  }

  const emp = await prisma.employee.findFirst({
    where: { employee_code: session.emp_id },
    select: { id: true },
  });

  if (!emp) return Response.json({ error: 'EMPLOYEE_NOT_FOUND' }, { status: 404 });

  let preview = null;
  try {
    preview = await calculateExtraPay({
      employeeId: emp.id,
      workDate,
      clockIn,
      clockOut,
      requestType,
    });
  } catch {
    // Preview fails silently
  }

  const [inH, inM] = clockIn.split(':').map(Number);
  const [outH, outM] = clockOut.split(':').map(Number);
  let totalMinutes = (outH * 60 + outM) - (inH * 60 + inM);
  if (totalMinutes <= 0) totalMinutes += 1440;
  const totalHours = Math.round((totalMinutes / 60) * 100) / 100;

  try {
    const created = await prisma.extraPayRequest.create({
      data: {
        employee_id: emp.id,
        work_date: workDate,
        request_type: requestType,
        planned_clock_in: clockIn,
        planned_clock_out: clockOut,
        total_hours: totalHours,
        reason,
        status: 'pending_supervisor',
        preview_amount: preview?.totalAmount ?? null,
      },
    });
    return Response.json({ request: created, preview }, { status: 201 });
  } catch (err) {
    if (err.code === 'P2002') {
      return Response.json({ error: 'DUPLICATE_REQUEST' }, { status: 409 });
    }
    return Response.json({ error: err.message }, { status: 500 });
  }
}
