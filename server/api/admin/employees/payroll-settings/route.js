/**
 * GET  /api/admin/employees/payroll-settings       – list employee payroll settings
 * POST /api/admin/employees/payroll-settings       – create or update settings
 */
import { validateSession } from '@/lib/validateSession';
import prisma from '@/lib/prisma';

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!session.is_admin) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const empCode = searchParams.get('emp_code');
  const siteId  = searchParams.get('site_id');

  const where = { is_active: true };
  if (empCode) where.emp_code    = empCode;
  if (siteId)  where.work_site_id = siteId;

  try {
    const rows = await prisma.employeePayrollSettings.findMany({
      where,
      select: {
        id: true,
        emp_code: true,
        pay_type: true,
        base_salary: true,
        daily_rate: true,
        bank_account_no: true,
        bank_name: true,
        social_security_no: true,
        social_security_enrolled: true,
        is_active: true,
        updated_at: true,
        workSite: {
          select: { id: true, name: true, site_code: true },
        },
      },
      orderBy: { emp_code: 'asc' },
    });

    // Rename workSite -> work_site for API compatibility
    const settings = rows.map(({ workSite, ...rest }) => ({
      ...rest,
      work_site: workSite ?? null,
    }));

    return Response.json({ settings });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!session.is_admin) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  const body = await req.json();
  const {
    emp_code, pay_type, base_salary, daily_rate, work_site_id,
    bank_account_no, bank_name, social_security_no, social_security_enrolled,
  } = body;

  if (!emp_code || !pay_type) {
    return Response.json({ error: 'MISSING_REQUIRED_FIELDS' }, { status: 400 });
  }
  if (!['monthly', 'daily'].includes(pay_type)) {
    return Response.json({ error: 'INVALID_PAY_TYPE' }, { status: 400 });
  }
  if (pay_type === 'monthly' && (!base_salary || base_salary <= 0)) {
    return Response.json({ error: 'BASE_SALARY_REQUIRED_FOR_MONTHLY' }, { status: 400 });
  }
  if (pay_type === 'daily' && (!daily_rate || daily_rate <= 0)) {
    return Response.json({ error: 'DAILY_RATE_REQUIRED_FOR_DAILY' }, { status: 400 });
  }

  // Resolve employee UUID from emp_code
  const emp = await prisma.employee.findFirst({
    where: { employee_code: emp_code },
    select: { id: true },
  });
  if (!emp) return Response.json({ error: 'EMPLOYEE_NOT_FOUND' }, { status: 404 });

  try {
    const upsertData = {
      emp_code,
      pay_type,
      base_salary: pay_type === 'monthly' ? (base_salary ?? null) : null,
      daily_rate:  pay_type === 'daily'   ? (daily_rate  ?? null) : null,
      work_site_id: work_site_id ?? null,
      bank_account_no: bank_account_no ?? null,
      bank_name: bank_name ?? null,
      social_security_no: social_security_no ?? null,
      social_security_enrolled: social_security_enrolled ?? true,
      is_active: true,
    };

    const data = await prisma.employeePayrollSettings.upsert({
      where: { employee_id: emp.id },
      create: { employee_id: emp.id, ...upsertData },
      update: upsertData,
    });

    return Response.json({ settings: data }, { status: 200 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
