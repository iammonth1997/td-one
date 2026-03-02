import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('login API handler', () => {
  let POST;

  describe('early validation', () => {
    beforeEach(async () => {
      vi.resetModules();

      const mockChain = {
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        eq: vi.fn(function () { return mockChain; }),
        select: vi.fn(function () { return mockChain; }),
      };

      vi.doMock('@/lib/supabaseServer', () => ({
        isServiceRoleEnabled: true,
        supabaseServer: { from: vi.fn(() => mockChain) },
      }));

      const route = await import('../../app/api/login/route.js');
      POST = route.POST;
    });

    it('returns INVALID_INPUT when emp_id missing', async () => {
      const req = new Request('http://localhost/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '1234' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('INVALID_INPUT');
    });

    it('returns USER_NOT_FOUND when user not in DB', async () => {
      const req = new Request('http://localhost/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emp_id: 'UNKNOWN', pin: '1111' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('USER_NOT_FOUND');
    });
  });

  describe('happy path', () => {
    beforeEach(async () => {
      vi.resetModules();

      vi.doMock('bcryptjs', () => ({
        default: { compare: vi.fn(async () => true) },
      }));

      const loginChain = {
        maybeSingle: vi.fn(async () => ({
          data: { pin_hash: '$2b$10$hash', role: 'employee', device_id_hash: null },
          error: null,
        })),
        eq: vi.fn(function () { return loginChain; }),
        select: vi.fn(function () { return loginChain; }),
      };
      const empChain = {
        maybeSingle: vi.fn(async () => ({
          data: { status: 'active' },
          error: null,
        })),
        eq: vi.fn(function () { return empChain; }),
        select: vi.fn(function () { return empChain; }),
      };

      vi.doMock('@/lib/supabaseServer', () => ({
        isServiceRoleEnabled: true,
        supabaseServer: {
          from: vi.fn((table) => table === 'login_users' ? loginChain : empChain),
        },
      }));

      const route = await import('../../app/api/login/route.js');
      POST = route.POST;
    });

    it('returns success with role and status for valid credentials', async () => {
      const req = new Request('http://localhost/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emp_id: 'EMP001', pin: '1234' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.role).toBe('employee');
      expect(body.status).toBe('active');
    });
  });
});
