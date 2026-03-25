import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('manpower API handler', () => {
  beforeEach(() => { vi.resetModules(); });

  function makeAdminMock() {
    return vi.fn(async () => ({ session: { is_admin: true, emp_id: 'ADMIN01' }, error: null, status: 200 }));
  }
  function makeNonAdminMock() {
    return vi.fn(async () => ({ session: { is_admin: false, role: 'employee', emp_id: 'EMP01' }, error: null, status: 200 }));
  }
  function makeUtils(overrides = {}) {
    return {
      isAdminSession: (s) => Boolean(s?.is_admin || s?.role === 'admin' || s?.role === 'super_admin'),
      extractIdFromUrl: (req) => new URL(req.url).pathname.split('/').filter(Boolean).pop(),
      ...overrides,
    };
  }

  describe('GET /api/admin/manpower', () => {
    it('returns FORBIDDEN for non-admin', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeNonAdminMock() }));
      vi.doMock('@/lib/prisma', () => ({ default: { manpowerPlan: { findMany: vi.fn(), create: vi.fn() } } }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());

      const { GET } = await import('../../server/api/admin/manpower/route.js');
      const res = await GET(new Request('http://localhost/api/admin/manpower'));
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('FORBIDDEN');
    });

    it('returns list of manpower plans for admin', async () => {
      const rows = [{ id: 'p1', plan_year: 2026, plan_name: 'Annual Plan 2026', status: 'draft' }];
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/prisma', () => ({
        default: {
          manpowerPlan: { findMany: vi.fn(async () => rows), create: vi.fn() },
        },
      }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());

      const { GET } = await import('../../server/api/admin/manpower/route.js');
      const res = await GET(new Request('http://localhost/api/admin/manpower'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.rows).toHaveLength(1);
    });
  });

  describe('POST /api/admin/manpower', () => {
    it('creates a manpower plan successfully', async () => {
      const newPlan = { id: 'p2', plan_year: 2026, plan_name: '2026 Expansion Plan', status: 'draft' };
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/prisma', () => ({
        default: {
          manpowerPlan: { findMany: vi.fn(), create: vi.fn(async () => newPlan) },
        },
      }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());

      const { POST } = await import('../../server/api/admin/manpower/route.js');
      const req = new Request('http://localhost/api/admin/manpower', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create_plan', plan_year: 2026, plan_name: '2026 Expansion Plan' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.row.plan_name).toBe('2026 Expansion Plan');
    });

    it('returns MISSING_REQUIRED_FIELDS when plan_year omitted', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/prisma', () => ({ default: { manpowerPlan: { findMany: vi.fn(), create: vi.fn() } } }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());

      const { POST } = await import('../../server/api/admin/manpower/route.js');
      const req = new Request('http://localhost/api/admin/manpower', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create_plan', plan_name: 'Missing Year Plan' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('MISSING_REQUIRED_FIELDS');
    });

    it('returns FORBIDDEN when non-admin tries to approve a plan', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeNonAdminMock() }));
      vi.doMock('@/lib/prisma', () => ({ default: { manpowerPlan: { findMany: vi.fn(), create: vi.fn() } } }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());

      const { POST } = await import('../../server/api/admin/manpower/route.js');
      const req = new Request('http://localhost/api/admin/manpower', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'approve', plan_id: 'p1' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
    });
  });
});
