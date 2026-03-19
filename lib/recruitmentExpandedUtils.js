import { supabaseServer } from '@/lib/supabaseServer';

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
  const { data, error } = await supabaseServer
    .from('employees')
    .select('id, employee_code')
    .eq('employee_code', empCode)
    .maybeSingle();

  if (error) return { employee: null, error };
  return { employee: data || null, error: null };
}

/**
 * Generate next request number HC-{YEAR}-{NNNN}.
 * Uses a count-based approach; relies on the UNIQUE constraint for safety in
 * low-concurrency HR usage.
 */
export async function generateHeadcountRequestNumber() {
  const year = new Date().getFullYear();
  const { count, error } = await supabaseServer
    .from('headcount_requests')
    .select('id', { count: 'exact', head: true });

  if (error) return { requestNumber: null, error };
  const seq = String((count ?? 0) + 1).padStart(4, '0');
  return { requestNumber: `HC-${year}-${seq}`, error: null };
}

/** Check if a candidate's name / id_card / phone matches any active blacklist entry */
export async function checkBlacklist({ full_name, id_card_number, phone }) {
  const filters = [];
  if (id_card_number) filters.push(`id_card_number.eq.${id_card_number}`);
  if (phone) filters.push(`phone.eq.${phone}`);

  let nameQuery = supabaseServer
    .from('blacklist')
    .select('id, full_name, reason_category, severity, can_reapply')
    .eq('status', 'active')
    .ilike('full_name', `%${full_name}%`);

  const { data: nameMatches, error: nameError } = await nameQuery;
  if (nameError) return { matches: [], error: nameError };

  let exactMatches = [];
  if (filters.length) {
    const { data, error } = await supabaseServer
      .from('blacklist')
      .select('id, full_name, reason_category, severity, can_reapply')
      .eq('status', 'active')
      .or(filters.join(','));
    if (error) return { matches: nameMatches || [], error: null };
    exactMatches = data || [];
  }

  const seen = new Set();
  const merged = [...(nameMatches || []), ...exactMatches].filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  return { matches: merged, error: null };
}
