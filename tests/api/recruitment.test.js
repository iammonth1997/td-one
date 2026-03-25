import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('recruitment API handler', () => {
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

  describe('GET /api/recruitment', () => {
    it('returns FORBIDDEN when not admin', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeNonAdminMock() }));
      vi.doMock('@/lib/prisma', () => ({
        default: {
          recruitmentRequisition: { findMany: vi.fn(), create: vi.fn() },
          recruitmentCandidate: { findMany: vi.fn(), create: vi.fn() },
        },
      }));

      const route = await import('../../server/api/recruitment/route.js');
      GET = route.GET;

      const res = await GET(new Request('http://localhost/api/recruitment'));
      expect(res.status).toBe(403);
      const body = await res.json();
      expect(body.error).toBe('FORBIDDEN');
    });

    it('returns requisitions list for admin (default view)', async () => {
      const rows = [
        { id: 'r1', job_code: 'JOB001', title: 'Software Engineer', status: 'open' },
      ];

      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/prisma', () => ({
        default: {
          recruitmentRequisition: { findMany: vi.fn(async () => rows), create: vi.fn() },
          recruitmentCandidate: { findMany: vi.fn(), create: vi.fn() },
        },
      }));

      const route = await import('../../server/api/recruitment/route.js');
      GET = route.GET;

      const res = await GET(new Request('http://localhost/api/recruitment'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.view).toBe('requisitions');
    });

    it('returns candidates list when view=candidates', async () => {
      const candidates = [
        { id: 'c1', full_name: 'สมชาย ดีมาก', current_stage: 'applied' },
      ];

      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/prisma', () => ({
        default: {
          recruitmentRequisition: { findMany: vi.fn(), create: vi.fn() },
          recruitmentCandidate: { findMany: vi.fn(async () => candidates), create: vi.fn() },
        },
      }));

      const route = await import('../../server/api/recruitment/route.js');
      GET = route.GET;

      const res = await GET(new Request('http://localhost/api/recruitment?view=candidates'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.view).toBe('candidates');
      expect(body.rows).toHaveLength(1);
    });
  });

  describe('POST /api/recruitment', () => {
    it('returns FORBIDDEN when not admin', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeNonAdminMock() }));
      vi.doMock('@/lib/prisma', () => ({
        default: {
          recruitmentRequisition: { findMany: vi.fn(), create: vi.fn() },
          recruitmentCandidate: { findMany: vi.fn(), create: vi.fn() },
        },
      }));

      const route = await import('../../server/api/recruitment/route.js');
      POST = route.POST;

      const req = new Request('http://localhost/api/recruitment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create_requisition', job_code: 'JOB002', title: 'Test' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(403);
    });

    it('returns MISSING_REQUIRED_FIELDS when job_code is missing', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/prisma', () => ({
        default: {
          recruitmentRequisition: { findMany: vi.fn(), create: vi.fn() },
          recruitmentCandidate: { findMany: vi.fn(), create: vi.fn() },
        },
      }));

      const route = await import('../../server/api/recruitment/route.js');
      POST = route.POST;

      const req = new Request('http://localhost/api/recruitment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create_requisition', title: 'Test Role' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('MISSING_REQUIRED_FIELDS');
    });

    it('returns UNKNOWN_ACTION for unrecognised action', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/prisma', () => ({
        default: {
          recruitmentRequisition: { findMany: vi.fn(), create: vi.fn() },
          recruitmentCandidate: { findMany: vi.fn(), create: vi.fn() },
        },
      }));

      const route = await import('../../server/api/recruitment/route.js');
      POST = route.POST;

      const req = new Request('http://localhost/api/recruitment', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'unknown' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('UNKNOWN_ACTION');
    });
  });
});
