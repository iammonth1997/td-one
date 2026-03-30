/**
 * GET  /api/admin/shifts                – list all shift patterns & types
 * GET  /api/admin/shifts?view=assignments&emp=  – view employee assignments
 * POST /api/admin/shifts (action=assign)        – assign a shift to an employee
 * POST /api/admin/shifts (action=create_pattern) – create a shift pattern
 */
import { validateSession } from '@/lib/validateSession';
import { getPrisma } from "@/lib/prisma";

export async function GET(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!session.is_admin) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const view = searchParams.get('view') ?? 'patterns';

  if (view === 'patterns') {
    const [patterns, types] = await Promise.all([
      prisma.shiftPattern.findMany({
        where: { is_active: true },
        orderBy: { pattern_name: 'asc' },
      }),
      prisma.shiftType.findMany({
        where: { is_active: true },
        orderBy: { type_name: 'asc' },
      }),
    ]);
    return Response.json({ patterns, types });
  }

  if (view === 'assignments') {
    const empCode = searchParams.get('emp');

    let employeeIdFilter = undefined;
    if (empCode) {
      const emp = await prisma.employee.findFirst({
        where: { employee_code: empCode },
        select: { id: true },
      });
      if (emp) employeeIdFilter = emp.id;
    }

    const assignments = await prisma.shiftAssignment.findMany({
      where: employeeIdFilter ? { employee_id: employeeIdFilter } : undefined,
      select: {
        id: true,
        effective_from: true,
        effective_to: true,
        cycle_start_date: true,
        employee_id: true,
        shift_pattern: {
          select: {
            pattern_name: true,
            work_days: true,
            rest_days: true,
            work_hours_per_day: true,
          },
        },
        shift_type: {
          select: {
            type_name: true,
            start_time: true,
            end_time: true,
            is_night_shift: true,
          },
        },
      },
      orderBy: { effective_from: 'desc' },
      take: 200,
    });

    return Response.json({ assignments });
  }

  return Response.json({ error: 'INVALID_VIEW' }, { status: 400 });
}

export async function POST(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!session.is_admin) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const body = await req.json();
  const action = String(body.action ?? 'assign').trim();

  if (action === 'assign') {
    const { emp_code, shift_pattern_id, shift_type_id, cycle_start_date, effective_from, effective_to } = body;
    if (!emp_code || !shift_pattern_id || !shift_type_id || !cycle_start_date || !effective_from) {
      return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
    }

    const emp = await prisma.employee.findFirst({
      where: { employee_code: emp_code },
      select: { id: true },
    });
    if (!emp) return Response.json({ error: 'EMPLOYEE_NOT_FOUND' }, { status: 404 });

    try {
      const data = await prisma.shiftAssignment.create({
        data: {
          employee_id:      emp.id,
          shift_pattern_id,
          shift_type_id,
          cycle_start_date,
          effective_from,
          effective_to: effective_to ?? null,
          assigned_by:  session.emp_id ?? null,
        },
      });
      return Response.json({ assignment: data }, { status: 201 });
    } catch (err) {
      // Postgres exclusion constraint violation (23P01) or unique violation
      if (err.message?.includes('23P01') || err.message?.includes('overlap')) {
        return Response.json({ error: 'OVERLAPPING_ASSIGNMENT' }, { status: 409 });
      }
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  if (action === 'create_pattern') {
    const { pattern_name, work_days, rest_days, work_hours_per_day } = body;
    if (!pattern_name || !work_days || !rest_days) {
      return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
    }

    try {
      const data = await prisma.shiftPattern.create({
        data: {
          pattern_name,
          work_days:          Number(work_days),
          rest_days:          Number(rest_days),
          cycle_total_days:   Number(work_days) + Number(rest_days),
          work_hours_per_day: work_hours_per_day ?? 8,
          is_active:          true,
        },
      });
      return Response.json({ pattern: data }, { status: 201 });
    } catch (err) {
      return Response.json({ error: err.message }, { status: 500 });
    }
  }

  return Response.json({ error: 'UNKNOWN_ACTION' }, { status: 400 });
}
