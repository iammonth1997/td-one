import { describe, it, expect, vi, beforeEach } from 'vitest';

let POST;

describe('set-pin API handler', () => {
  describe('early validation', () => {
    beforeEach(async () => {
      vi.resetModules();

      vi.doMock('@/lib/checkRateLimit', () => ({
        checkRateLimit: vi.fn(async () => ({ locked: false, minutesRemaining: null })),
        recordLoginAttempt: vi.fn(async () => {}),
        clearFailedAttempts: vi.fn(async () => {}),
      }));

      vi.doMock('@/lib/prisma', () => ({
        default: {
          employee: { findFirst: vi.fn(async () => null) },
          $executeRaw: vi.fn(async () => 1),
        },
      }));

      const route = await import('../../server/api/login/set-pin/route.js');
      POST = route.POST;
    });

    it('rejects missing fields', async () => {
      const req = new Request('http://localhost/api/login/set-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emp_id: 'A' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('INVALID_INPUT');
    });

    it('rejects when employee not found', async () => {
      const req = new Request('http://localhost/api/login/set-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emp_id: 'A', date_of_birth: '2000-01-01', pin: '1234' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('EMPLOYEE_NOT_FOUND');
    });
  });

  describe('happy path', () => {
    beforeEach(async () => {
      vi.resetModules();

      vi.doMock('bcryptjs', () => ({
        default: {
          genSalt: vi.fn(async () => 'salt'),
          hash: vi.fn(async () => '$2b$10$hashed_pin'),
        },
      }));

      vi.doMock('@/lib/checkRateLimit', () => ({
        checkRateLimit: vi.fn(async () => ({ locked: false, minutesRemaining: null })),
        recordLoginAttempt: vi.fn(async () => {}),
        clearFailedAttempts: vi.fn(async () => {}),
      }));

      vi.doMock('@/lib/prisma', () => ({
        default: {
          employee: {
            findFirst: vi.fn(async () => ({
              date_of_birth: new Date('2000-01-01'),
              status: 'active',
            })),
          },
          $executeRaw: vi.fn(async () => 1),
        },
      }));

      const route = await import('../../server/api/login/set-pin/route.js');
      POST = route.POST;
    });

    it('sets PIN successfully when DOB matches', async () => {
      const req = new Request('http://localhost/api/login/set-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emp_id: 'EMP001', date_of_birth: '2000-01-01', pin: '1234' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
    });

    it('rejects when DOB does not match', async () => {
      const req = new Request('http://localhost/api/login/set-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emp_id: 'EMP001', date_of_birth: '1999-12-31', pin: '1234' }),
      });
      const res = await POST(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe('INVALID_DOB');
    });
  });
});
