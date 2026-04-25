import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('session runtime helpers', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unmock('@/lib/prisma');
  });

  it('binds Cloudflare env to legacy requests before invoking the handler', async () => {
    vi.doMock('~/lib/session-cookie.server', () => ({
      sessionTokenCookie: {
        parse: vi.fn(async () => null),
      },
    }));

    const { proxyLegacyApi } = await import('../../remix-app/app/lib/legacy-api-bridge.server.ts');
    const { getRequestCloudflareEnv } = await import('../../lib/requestContext.ts');

    const legacy = {
      GET: vi.fn(async (request) => {
        const env = getRequestCloudflareEnv(request);
        return Response.json({ databaseUrl: env?.DATABASE_URL || null });
      }),
    };

    const response = await proxyLegacyApi(
      new Request('http://localhost/api/runtime-check'),
      legacy,
      { cloudflare: { env: { DATABASE_URL: 'postgres://ctx-db/runtime' } } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      databaseUrl: 'postgres://ctx-db/runtime',
    });
    expect(legacy.GET).toHaveBeenCalledTimes(1);
  });

  it('validateSession resolves Prisma env from the bound request context', async () => {
    const getPrisma = vi.fn(() => ({
      authSession: {
        findFirst: vi.fn(async () => ({
          id: 'session-1',
          emp_id: 'ADMIN01',
          role: 'admin',
          device_id: 'device-123',
          expires_at: new Date(Date.now() + 60_000).toISOString(),
          is_active: true,
          login_context: 'admin_portal',
        })),
      },
    }));

    vi.doMock('@/lib/prisma', () => ({
      __esModule: true,
      getPrisma,
    }));

    const { bindRequestCloudflareEnv } = await import('../../lib/requestContext.ts');
    const { validateSession } = await import('../../lib/validateSession.js');

    const request = bindRequestCloudflareEnv(
      new Request('http://localhost/api/runtime-check', {
        headers: {
          authorization: 'Bearer test-session-token',
          'x-device-id': 'device-123',
        },
      }),
      { cloudflare: { env: { DATABASE_URL: 'postgres://ctx-db/request' } } },
    );

    const result = await validateSession(request);

    expect(getPrisma).toHaveBeenCalledWith(
      expect.objectContaining({
        DATABASE_URL: 'postgres://ctx-db/request',
      }),
    );
    expect(result).toEqual({
      session: expect.objectContaining({
        emp_id: 'ADMIN01',
        is_admin: true,
        role: 'admin',
      }),
      error: null,
      status: 200,
    });
  });
});
