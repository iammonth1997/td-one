import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('headcount request API handler', () => {
  beforeEach(() => { vi.resetModules(); });

  function makeAdminMock() {
    return vi.fn(async () => ({ session: { is_admin: true, emp_id: 'ADMIN01', role: 'admin' }, error: null, status: 200 }));
  }
  function makeSupervisorMock() {
    return vi.fn(async () => ({ session: { is_admin: false, emp_id: 'SUP01', role: 'supervisor' }, error: null, status: 200 }));
  }
  function makeEmployeeMock() {
    return vi.fn(async () => ({ session: { is_admin: false, emp_id: 'EMP02', role: 'employee' }, error: null, status: 200 }));
  }
  function makeUtils(overrides = {}) {
    return {
      isAdminSession: (s) => Boolean(s?.is_admin || s?.role === 'admin' || s?.role === 'super_admin'),
      canSubmitHeadcountRequest: (s) => ['supervisor', 'manager', 'admin', 'super_admin'].includes(s?.role),
      canApproveAsManager: (s) => ['manager', 'admin', 'super_admin'].includes(s?.role) || Boolean(s?.is_admin),
      canApproveAsHR: (s) => Boolean(s?.is_admin) || ['admin', 'super_admin'].includes(s?.role),
      extractIdFromUrl: (req) => new URL(req.url).pathname.split('/').filter(Boolean).pop(),
      generateHeadcountRequestNumber: async () => 'HC-2026-0001',
      resolveEmployeeId: async () => ({ employee: { id: 'emp-uuid-1' }, error: null }),
      ...overrides,
    };
  }

  describe('POST /api/requests/headcount (submit)', () => {
    it('allows supervisor to submit a headcount request', async () => {
      const newReq = { id: 'hc1', request_number: 'HC-2026-0001', status: 'pending_manager' };

      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeSupervisorMock() }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());
      vi.doMock('@/lib/supabaseServer', () => ({
        supabaseServer: {
          from: vi.fn((table) => {
            if (table === 'employees') {
              return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { id: 'emp-uuid-1' }, error: null })) })) })) };
            }
            if (table === 'headcount_requests') {
              return {
                select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })),
                insert: vi.fn(() => ({ select: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: newReq, error: null })) })) })),
              };
            }
            return { select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: null, error: null })) })) })) };
          }),
        },
      }));

      const { POST } = await import('../../server/api/requests/headcount/route.js');
      const req = new Request('http://localhost/api/requests/headcount', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          position_title: 'Forklift Operator',
          number_of_positions: 2,
          employment_type: 'full_time',
          urgency: 'normal',
          reason_type: 'new_position',
          justification: 'Production expansion at Site A',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.row.status).toBe('pending_manager');
    });

    it('returns FORBIDDEN when regular employee tries to submit', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeEmployeeMock() }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());
      vi.doMock('@/lib/supabaseServer', () => ({ supabaseServer: { from: vi.fn() } }));

      const { POST } = await import('../../server/api/requests/headcount/route.js');
      const req = new Request('http://localhost/api/requests/headcount', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ position_title: 'Forklift Operator', number_of_positions: 1, employment_type: 'full_time', urgency: 'normal', reason_type: 'new_position', justification: 'test' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it('returns MISSING_REQUIRED_FIELDS when justification is absent', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeSupervisorMock() }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());
      vi.doMock('@/lib/supabaseServer', () => ({ supabaseServer: { from: vi.fn() } }));

      const { POST } = await import('../../server/api/requests/headcount/route.js');
      const req = new Request('http://localhost/api/requests/headcount', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ position_title: 'Engineer', number_of_positions: 1, employment_type: 'full_time', urgency: 'normal', reason_type: 'new_position' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('MISSING_REQUIRED_FIELDS');
    });
  });

  describe('POST /api/admin/headcount/:id (approve step 1)', () => {
    it('allows admin to approve step 1 (pending_manager → pending_hr)', async () => {
      const hcRequest = { id: 'hc1', status: 'pending_manager', current_approval_step: 1 };
      const afterApprove = { ...hcRequest, status: 'pending_hr', current_approval_step: 2 };

      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());
      vi.doMock('@/lib/supabaseServer', () => ({
        supabaseServer: {
          from: vi.fn((table) => {
            if (table === 'headcount_requests') {
              return {
                select: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    maybeSingle: vi.fn(async () => ({ data: hcRequest, error: null })),
                  })),
                })),
                update: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                      maybeSingle: vi.fn(async () => ({ data: afterApprove, error: null })),
                    })),
                  })),
                })),
              };
            }
            if (table === 'headcount_approval_actions') {
              return { insert: vi.fn(async () => ({ error: null })) };
            }
            return { from: vi.fn() };
          }),
        },
      }));

      const { POST } = await import('../../server/api/admin/headcount/[id]/route.js');
      const req = new Request('http://localhost/api/admin/headcount/hc1', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'approve', comment: 'Approved by manager' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.row.status).toBe('pending_hr');
    });
  });
});
