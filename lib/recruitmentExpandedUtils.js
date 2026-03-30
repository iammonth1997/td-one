import { getPrisma } from '@/lib/prisma';

/**
 * Shared helpers for expanded Recruitment module (025+).
 * Payroll / Auth / Attendance code is NOT touched here.
 */

export function isAdminSession(session) {
  return Boolean(session?.is_admin || session?.role === 'admin' || session?.role === 'super_admin');
}

export function canSubmitHeadcountRequest(session) {
  return ['supervisor', 'manager', 'admin', 'super_admin'].includes(session?.role);
}

export function canApproveAsManager(session) {
  return ['manager', 'admin', 'super_admin'].includes(session?.role);
}

/** Only admin / super_admin can act as HR approver */
export function canApproveAsHR(session) {
  return isAdminSession(session);
}

/** Extract last path segment as {id} from req.url — used by all [id] routes */
export function extractIdFromUrl(req) {
  const segments = new URL(req.url).pathname.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? null;
}

/** Resolve employees.id UUID from employee_code string (emp_id in session) */
export async function resolveEmployeeId(empCode) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  try {
    const employee = await prisma.employee.findFirst({
      where: { employee_code: empCode },
      select: { id: true, employee_code: true },
    });
    return { employee: employee || null, error: null };
  } catch (err) {
    return { employee: null, error: err };
  }
}

/**
 * Generate next request number HC-{YEAR}-{NNNN}.
 * Uses a count-based approach; relies on the UNIQUE constraint for safety in
 * low-concurrency HR usage.
 */
export async function generateHeadcountRequestNumber() {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  try {
    const year = new Date().getFullYear();
    const count = await prisma.headcountRequest.count();
    const seq = String(count + 1).padStart(4, '0');
    return { requestNumber: `HC-${year}-${seq}`, error: null };
  } catch (err) {
    return { requestNumber: null, error: err };
  }
}

/** Check if a candidate's name / id_card / phone matches any active blacklist entry */
export async function checkBlacklist({ full_name, id_card_number, phone }) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  try {
    // Name-based fuzzy match
    const nameMatches = await prisma.blacklist.findMany({
      where: {
        status: 'active',
        full_name: { contains: full_name, mode: 'insensitive' },
      },
      select: { id: true, full_name: true, reason_category: true, severity: true, can_reapply: true },
    });

    // Exact matches on id_card_number or phone
    let exactMatches = [];
    const orConditions = [];
    if (id_card_number) orConditions.push({ id_card_number });
    if (phone) orConditions.push({ phone });

    if (orConditions.length > 0) {
      exactMatches = await prisma.blacklist.findMany({
        where: { status: 'active', OR: orConditions },
        select: { id: true, full_name: true, reason_category: true, severity: true, can_reapply: true },
      });
    }

    // Deduplicate by id
    const seen = new Set();
    const merged = [...nameMatches, ...exactMatches].filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });

    return { matches: merged, error: null };
  } catch (err) {
    return { matches: [], error: err };
  }
}
