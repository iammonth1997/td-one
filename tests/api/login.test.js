import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockPrismaModule } from './prisma-test-helper.js';

describe('login API handler', () => {
  let POST;

  describe('early validation', () => {
    beforeEach(async () => {
      vi.resetModules();

      vi.doMock('@/lib/checkRateLimit', () => ({
        checkRateLimit: vi.fn(async () => ({ locked: false, minutesRemaining: null })),
        recordLoginAttempt: vi.fn(async () => {}),
        clearFailedAttempts: vi.fn(async () => {}),
      }));

      vi.doMock('@/lib/prisma', () => mockPrismaModule({
        loginUser: { findFirst: vi.fn(async () => null) },
        employee: { findUnique: vi.fn(async () => null) },
        authSession: { create: vi.fn(async () => ({})) },
      }));

      const route = await import('../../server/api/login/route.js');
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

      vi.doMock('@/lib/checkRateLimit', () => ({
        checkRateLimit: vi.fn(async () => ({ locked: false, minutesRemaining: null })),
        recordLoginAttempt: vi.fn(async () => {}),
        clearFailedAttempts: vi.fn(async () => {}),
      }));

      vi.doMock('@/lib/prisma', () => mockPrismaModule({
        loginUser: {
          findFirst: vi.fn(async () => ({
            pin_hash: '$2b$10$hash',
            role: 'employee',
            device_id_hash: null,
            force_pin_change: false,
            temp_pin_expires_at: null,
          })),
        },
        employee: {
          findUnique: vi.fn(async () => ({ status: 'active' })),
        },
        authSession: {
          create: vi.fn(async () => ({})),
        },
      }));

      const route = await import('../../server/api/login/route.js');
      POST = route.POST;
    });

    it('returns success with role and status for valid credentials', async () => {
      const req = new Request('http://localhost/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-device-id': 'test-device-123',
        },
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
