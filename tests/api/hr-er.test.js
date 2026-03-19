import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('hr-er API handler', () => {
  let GET, POST;

  beforeEach(() => {
    vi.resetModules();
  });

  function makeAdminMock() {
    return vi.fn(async () => ({ session: { is_admin: true, emp_id: 'ADMIN01' }, error: null, status: 200 }));
  }

  function makeNonAdminMock() {
    return vi.fn(async () => ({ session: { is_admin: false, role: 'employee', emp_id: 'EMP01' }, error: null, status: 200 }));
  }

  describe('GET /api/hr-er', () => {
    it('returns FORBIDDEN when not admin', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeNonAdminMock() }));
      vi.doMock('@/lib/supabaseServer', () => ({ supabaseServer: { from: vi.fn() } }));

      const route = await import('../../server/api/hr-er/route.js');
      GET = route.GET;

      const res = await GET(new Request('http://localhost/api/hr-er'));
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('FORBIDDEN');
    });

    it('returns case list for admin', async () => {
      const rows = [
        { id: 'case1', case_type: 'grievance', title: 'Test Grievance', status: 'open' },
      ];

      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/supabaseServer', () => ({
        supabaseServer: {
          from: vi.fn(() => ({
            select: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(async () => ({ data: rows, error: null })),
              })),
            })),
          })),
        },
      }));

      const route = await import('../../server/api/hr-er/route.js');
      GET = route.GET;

      const res = await GET(new Request('http://localhost/api/hr-er'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.rows).toHaveLength(1);
    });
  });

  describe('POST /api/hr-er', () => {
    it('returns FORBIDDEN when not admin', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeNonAdminMock() }));
      vi.doMock('@/lib/supabaseServer', () => ({ supabaseServer: { from: vi.fn() } }));

      const route = await import('../../server/api/hr-er/route.js');
      POST = route.POST;

      const req = new Request('http://localhost/api/hr-er', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create_case', employee_code: 'EMP01', case_type: 'grievance', title: 'Test' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it('returns MISSING_REQUIRED_FIELDS when title is missing', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/supabaseServer', () => ({ supabaseServer: { from: vi.fn() } }));

      const route = await import('../../server/api/hr-er/route.js');
      POST = route.POST;

      const req = new Request('http://localhost/api/hr-er', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create_case', employee_code: 'EMP01', case_type: 'grievance' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('MISSING_REQUIRED_FIELDS');
    });

    it('returns INVALID_CASE_TYPE for invalid case_type', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/supabaseServer', () => ({ supabaseServer: { from: vi.fn() } }));

      const route = await import('../../server/api/hr-er/route.js');
      POST = route.POST;

      const req = new Request('http://localhost/api/hr-er', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create_case', employee_code: 'EMP01', case_type: 'invalid_type', title: 'Test' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('INVALID_CASE_TYPE');
    });

    it('apply_deduction uses employee_deductions table — rejects invalid deduction_kind', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/supabaseServer', () => ({ supabaseServer: { from: vi.fn() } }));

      const route = await import('../../server/api/hr-er/route.js');
      POST = route.POST;

      const req = new Request('http://localhost/api/hr-er', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'apply_deduction', deduction_kind: 'bonus', amount: 500, start_month: '2026-03', employee_code: 'EMP01' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('INVALID_DEDUCTION_KIND');
    });

    it('apply_deduction rejects zero or negative amount', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/supabaseServer', () => ({ supabaseServer: { from: vi.fn() } }));

      const route = await import('../../server/api/hr-er/route.js');
      POST = route.POST;

      const req = new Request('http://localhost/api/hr-er', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'apply_deduction', deduction_kind: 'welfare', amount: 0, start_month: '2026-03', employee_code: 'EMP01' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('INVALID_AMOUNT');
    });

    it('apply_deduction inserts into employee_deductions and returns deduction_table flag', async () => {
      const insertedDeduction = {
        id: 'ded-uuid-1',
        employee_id: 'emp-uuid-1',
        custom_name: 'Welfare Deduction',
        amount: 1500,
        start_month: '2026-03',
        is_active: true,
      };

      const empChain = {
        select: vi.fn(() => empChain),
        eq: vi.fn(() => empChain),
        maybeSingle: vi.fn(async () => ({ data: { id: 'emp-uuid-1', employee_code: 'EMP01' }, error: null })),
      };

      const insertChain = {
        insert: vi.fn(() => insertChain),
        select: vi.fn(() => insertChain),
        maybeSingle: vi.fn(async () => ({ data: insertedDeduction, error: null })),
      };

      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/supabaseServer', () => ({
        supabaseServer: {
          from: vi.fn((table) => {
            if (table === 'employees') return empChain;
            if (table === 'employee_deductions') return insertChain;
            return {};
          }),
        },
      }));

      const route = await import('../../server/api/hr-er/route.js');
      POST = route.POST;

      const req = new Request('http://localhost/api/hr-er', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'apply_deduction',
          deduction_kind: 'welfare',
          amount: 1500,
          start_month: '2026-03',
          employee_code: 'EMP01',
        }),
      });
      const res = await POST(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.deduction_table).toBe('employee_deductions');
      expect(body.row.custom_name).toBe('Welfare Deduction');
    });

    it('returns UNKNOWN_ACTION for unrecognised action', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/supabaseServer', () => ({ supabaseServer: { from: vi.fn() } }));

      const route = await import('../../server/api/hr-er/route.js');
      POST = route.POST;

      const req = new Request('http://localhost/api/hr-er', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete_everything' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('UNKNOWN_ACTION');
    });
  });
});
