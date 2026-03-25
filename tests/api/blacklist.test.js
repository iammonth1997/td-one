import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('blacklist API handler', () => {
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
      checkBlacklist: vi.fn(async ({ full_name, id_card_number }) => ({
        matches: id_card_number === '1234567890123'
          ? [{ id: 'bl1', full_name: 'John Doe', reason_category: 'theft', severity: 'permanent' }]
          : [],
        error: null,
      })),
      ...overrides,
    };
  }

  describe('GET /api/admin/blacklist (list)', () => {
    it('returns active blacklist entries for admin', async () => {
      const rows = [{ id: 'bl1', full_name: 'John Doe', reason_category: 'theft', severity: 'permanent', status: 'active' }];
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());
      vi.doMock('@/lib/prisma', () => ({
        default: {
          blacklist: { findMany: vi.fn(async () => rows), create: vi.fn() },
        },
      }));

      const { GET } = await import('../../server/api/admin/blacklist/route.js');
      const res = await GET(new Request('http://localhost/api/admin/blacklist'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.rows).toHaveLength(1);
    });

    it('returns FORBIDDEN for non-admin', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeNonAdminMock() }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());
      vi.doMock('@/lib/prisma', () => ({ default: { blacklist: { findMany: vi.fn(), create: vi.fn() } } }));

      const { GET } = await import('../../server/api/admin/blacklist/route.js');
      const res = await GET(new Request('http://localhost/api/admin/blacklist'));
      expect(res.status).toBe(403);
    });
  });

  describe('GET /api/admin/blacklist?view=check (blacklist check)', () => {
    it('returns blacklisted=true when ID card matches', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());
      vi.doMock('@/lib/prisma', () => ({ default: { blacklist: { findMany: vi.fn(), create: vi.fn() } } }));

      const { GET } = await import('../../server/api/admin/blacklist/route.js');
      const res = await GET(new Request('http://localhost/api/admin/blacklist?view=check&id_card_number=1234567890123&full_name=John+Doe'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.blacklisted).toBe(true);
      expect(body.matches).toHaveLength(1);
    });

    it('returns blacklisted=false when no match', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());
      vi.doMock('@/lib/prisma', () => ({ default: { blacklist: { findMany: vi.fn(), create: vi.fn() } } }));

      const { GET } = await import('../../server/api/admin/blacklist/route.js');
      const res = await GET(new Request('http://localhost/api/admin/blacklist?view=check&id_card_number=9999999999999&full_name=Jane+Smith'));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.blacklisted).toBe(false);
      expect(body.matches).toHaveLength(0);
    });

    it('returns MISSING_SEARCH_PARAMS when no query params', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());
      vi.doMock('@/lib/prisma', () => ({ default: { blacklist: { findMany: vi.fn(), create: vi.fn() } } }));

      const { GET } = await import('../../server/api/admin/blacklist/route.js');
      const res = await GET(new Request('http://localhost/api/admin/blacklist?view=check'));
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('MISSING_SEARCH_PARAMS');
    });
  });

  describe('POST /api/admin/blacklist (add)', () => {
    it('adds a person to blacklist successfully', async () => {
      const newEntry = { id: 'bl2', full_name: 'Bad Actor', reason_category: 'fraud', severity: 'permanent', status: 'active' };
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());
      vi.doMock('@/lib/prisma', () => ({
        default: {
          blacklist: { findMany: vi.fn(), create: vi.fn(async () => newEntry) },
        },
      }));

      const { POST } = await import('../../server/api/admin/blacklist/route.js');
      const req = new Request('http://localhost/api/admin/blacklist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          full_name: 'Bad Actor',
          reason_category: 'fraud',
          reason_detail: 'Submitted forged documents during recruitment',
          severity: 'permanent',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.row.reason_category).toBe('fraud');
    });

    it('returns TEMPORARY_REQUIRES_EXPIRY_DATE for temporary without expiry', async () => {
      vi.doMock('@/lib/validateSession', () => ({ validateSession: makeAdminMock() }));
      vi.doMock('@/lib/recruitmentExpandedUtils', () => makeUtils());
      vi.doMock('@/lib/prisma', () => ({ default: { blacklist: { findMany: vi.fn(), create: vi.fn() } } }));

      const { POST } = await import('../../server/api/admin/blacklist/route.js');
      const req = new Request('http://localhost/api/admin/blacklist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          full_name: 'Temp Bad',
          reason_category: 'no_show',
          reason_detail: 'Accepted offer then did not show up',
          severity: 'temporary',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('TEMPORARY_REQUIRES_EXPIRY_DATE');
    });
  });
});
