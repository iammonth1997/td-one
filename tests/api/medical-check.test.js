import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('medical-check API handler', () => {
  beforeEach(() => { vi.resetModules(); });

  function makeAdminMock() {
    return vi.fn(async () => ({ session: { is_admin: true, emp_id: 'ADMIN01' }, error: null, status: 200 }));
  }
  function makeNonAdminMock() {
    return vi.fn(async () => ({ session: { is_admin: false, role: 'employee', emp_id: 'EMP01' }, error: null, status: 200 }));
  }
  function makeUtils() {
    return {
      isAdminSession: (s) => Boolean(s?.is_admin || s?.role === 'admin' || s?.role === 'super_admin'),
      extractIdFromUrl: (req) => new URL(req.url).pathname.split('/').filter(Boolean).pop(),
    };
  }

  describe('GET /api/admin/medical-check', () => {
    it('returns FORBIDDEN for non-admin', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeNonAdminMock() }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());
      vi.doMock('@/lib/prisma', () => ({
        default: {
          medicalCheckType: { findMany: vi.fn(), create: vi.fn() },
          medicalCheck: { findMany: vi.fn(), create: vi.fn() },
          employee: { findFirst: vi.fn() },
        },
      }));

      const { GET } = await import('../../server/api/admin/medical-check/route.js');
      const res = await GET(new Request('http://localhost/api/admin/medical-check'));
      expect(res.status).toBe(403);
    });

    it('returns check types list when view=types', async () => {
      const types = [{ id: 't1', check_name: 'Blood Test', is_mandatory_pre_employment: true }];
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());
      vi.doMock('@/lib/prisma', () => ({
        default: {
          medicalCheckType: { findMany: vi.fn(async () => types), create: vi.fn() },
          medicalCheck: { findMany: vi.fn(), create: vi.fn() },
          employee: { findFirst: vi.fn() },
        },
      }));

      const { GET } = await import('../../server/api/admin/medical-check/route.js');
      const res = await GET(new Request('http://localhost/api/admin/medical-check?view=types'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.rows).toHaveLength(1);
      expect(body.rows[0].check_name).toBe('Blood Test');
    });

    it('returns filtered checks for an employee', async () => {
      const checks = [{ id: 'mc1', person_type: 'employee', result: 'fit', check_date: '2026-01-15' }];
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());
      vi.doMock('@/lib/prisma', () => ({
        default: {
          medicalCheckType: { findMany: vi.fn(), create: vi.fn() },
          medicalCheck: { findMany: vi.fn(async () => checks), create: vi.fn() },
          employee: { findFirst: vi.fn(async () => ({ id: 'emp-uuid-1' })) },
        },
      }));

      const { GET } = await import('../../server/api/admin/medical-check/route.js');
      const res = await GET(new Request('http://localhost/api/admin/medical-check?employee_code=EMP001'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });
  });

  describe('POST /api/admin/medical-check (record_check)', () => {
    it('records a medical check for a candidate', async () => {
      const newCheck = { id: 'mc2', person_type: 'candidate', result: 'fit', check_date: '2026-03-10', hospital_name: 'City Hospital' };
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());
      vi.doMock('@/lib/prisma', () => ({
        default: {
          medicalCheckType: { findMany: vi.fn(), create: vi.fn() },
          medicalCheck: { findMany: vi.fn(), create: vi.fn(async () => newCheck) },
          employee: { findFirst: vi.fn() },
        },
      }));

      const { POST } = await import('../../server/api/admin/medical-check/route.js');
      const req = new Request('http://localhost/api/admin/medical-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'record_check',
          person_type: 'candidate',
          candidate_id: 'cand-uuid-1',
          check_date: '2026-03-10',
          hospital_name: 'City Hospital',
          result: 'fit',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.row.result).toBe('fit');
    });

    it('returns INVALID_RESULT for unknown result value', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());
      vi.doMock('@/lib/prisma', () => ({
        default: {
          medicalCheckType: { findMany: vi.fn(), create: vi.fn() },
          medicalCheck: { findMany: vi.fn(), create: vi.fn() },
          employee: { findFirst: vi.fn() },
        },
      }));

      const { POST } = await import('../../server/api/admin/medical-check/route.js');
      const req = new Request('http://localhost/api/admin/medical-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'record_check',
          person_type: 'employee',
          employee_id: 'emp-uuid-1',
          check_date: '2026-03-10',
          hospital_name: 'City Hospital',
          result: 'unknown_status',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('INVALID_RESULT');
    });

    it('returns MISSING_REQUIRED_FIELDS when check_date absent', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());
      vi.doMock('@/lib/prisma', () => ({
        default: {
          medicalCheckType: { findMany: vi.fn(), create: vi.fn() },
          medicalCheck: { findMany: vi.fn(), create: vi.fn() },
          employee: { findFirst: vi.fn() },
        },
      }));

      const { POST } = await import('../../server/api/admin/medical-check/route.js');
      const req = new Request('http://localhost/api/admin/medical-check', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'record_check',
          person_type: 'candidate',
          candidate_id: 'cand-uuid-1',
          hospital_name: 'City Hospital',
          result: 'fit',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('MISSING_REQUIRED_FIELDS');
    });
  });
});
