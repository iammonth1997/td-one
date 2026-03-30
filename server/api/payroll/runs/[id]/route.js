/**
 * GET  /api/payroll/runs/[id]         – return run details
 * GET  /api/payroll/runs/[id]?action=items – return payroll items
 * POST /api/payroll/runs/[id]?action=calculate
 * POST /api/payroll/runs/[id]?action=approve
 * POST /api/payroll/runs/[id]?action=mark-paid
 */
import { validateSession } from '@/lib/validateSession';
import { executeSalaryRun, executeOTRun } from '@/lib/payrollEngine';
import { getPrisma } from "@/lib/prisma";

export async function GET(req, { params }) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!session.is_admin) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { id } = await params;
  if (!id) return Response.json({ error: 'MISSING_RUN_ID' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  if (action === 'items') {
    const items = await prisma.payrollItem.findMany({
      where: { payroll_run_id: id },
      orderBy: { emp_code: 'asc' },
    });
    return Response.json({ items });
  }

  const run = await prisma.payrollRun.findUnique({
    where: { id },
    include: { },
  });
  if (!run) return Response.json({ error: 'RUN_NOT_FOUND' }, { status: 404 });
  return Response.json({ run });
}

export async function POST(req, { params }) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!session.is_admin) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { id } = await params;
  if (!id) return Response.json({ error: 'MISSING_RUN_ID' }, { status: 400 });

  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');

  if (action === 'calculate') {
    const run = await prisma.payrollRun.findUnique({ where: { id }, select: { run_type: true } });
    if (!run) return Response.json({ error: 'RUN_NOT_FOUND' }, { status: 404 });

    try {
      const createdBy = session.emp_id ?? session.email ?? 'admin';
      const result = run.run_type === 'salary'
        ? await executeSalaryRun(id, createdBy)
        : await executeOTRun(id, createdBy);
      return Response.json({ success: true, result });
    } catch (err) {
      console.error('payroll calculate:', err);
      await prisma.payrollRun.update({ where: { id }, data: { status: 'draft' } });
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  if (action === 'approve') {
    const run = await prisma.payrollRun.findUnique({ where: { id }, select: { status: true } });
    if (!run) return Response.json({ error: 'RUN_NOT_FOUND' }, { status: 404 });
    if (run.status !== 'review') {
      return Response.json({ error: 'RUN_NOT_IN_REVIEW', current: run.status }, { status: 409 });
    }
    await prisma.payrollRun.update({
      where: { id },
      data: {
        status: 'approved',
        approved_by: session.emp_id ?? session.email,
        approved_at: new Date(),
      },
    });
    return Response.json({ status: 'approved' });
  }

  if (action === 'mark-paid') {
    const run = await prisma.payrollRun.findUnique({ where: { id }, select: { status: true } });
    if (!run) return Response.json({ error: 'RUN_NOT_FOUND' }, { status: 404 });
    if (run.status !== 'approved') {
      return Response.json({ error: 'RUN_NOT_APPROVED', current: run.status }, { status: 409 });
    }
    await prisma.payrollRun.update({
      where: { id },
      data: { status: 'paid', paid_at: new Date() },
    });
    return Response.json({ status: 'paid' });
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
