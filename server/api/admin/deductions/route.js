/**
 * GET /api/admin/deductions
 * Returns deduction templates and active employee deductions summary.
 *
 * POST /api/admin/deductions  – create a deduction template
 */
import { validateSession } from '@/lib/validateSession';
import { getPrisma } from "@/lib/prisma";

export async function GET(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!session.is_admin) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  let templates, activeCount;

  try {
    templates = await prisma.deductionTemplate.findMany({
      select: {
        id: true,
        name: true,
        name_th: true,
        deduction_type: true,
        default_amount: true,
        default_percentage: true,
        applies_to_run_type: true,
        auto_apply: true,
        is_active: true,
      },
      orderBy: { name: 'asc' },
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }

  try {
    activeCount = await prisma.employeeDeduction.count({
      where: { is_active: true },
    });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }

  return Response.json({
    templates: templates ?? [],
    active_employee_deductions: activeCount ?? 0,
  });
}

export async function POST(req) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) return Response.json({ error: authError }, { status: authStatus });
  if (!session.is_admin) return Response.json({ error: 'FORBIDDEN' }, { status: 403 });

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'INVALID_JSON' }, { status: 400 });
  }

  const { name, name_th, deduction_type, default_amount, default_percentage, applies_to_run_type, auto_apply } = body;
  if (!name || !deduction_type) {
    return Response.json({ error: 'name and deduction_type are required' }, { status: 400 });
  }

  try {
    const row = await prisma.deductionTemplate.create({
      data: {
        name: String(name).trim(),
        name_th: name_th ? String(name_th).trim() : null,
        deduction_type: String(deduction_type).trim(),
        default_amount: default_amount != null ? Number(default_amount) : null,
        default_percentage: default_percentage != null ? Number(default_percentage) : null,
        applies_to_run_type: applies_to_run_type ?? null,
        auto_apply: Boolean(auto_apply ?? false),
        is_active: true,
      },
    });
    return Response.json({ template: row }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
