import { describe, it, expect, vi, beforeEach } from 'vitest';

let POST;

describe('set-pin API handler', () => {
  beforeEach(async () => {
    vi.resetModules();

    // Employee lookup chain: .from('employees').select().eq().maybeSingle()
    const empChain = {
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      eq: vi.fn(function () { return empChain; }),
      select: vi.fn(function () { return empChain; }),
    };

    // Upsert chain: .from('login_users').upsert().select()
    const upsertResultChain = {
      select: vi.fn(async () => ({ error: null })),
    };

    vi.doMock('@/lib/supabaseServer', () => ({
      isServiceRoleEnabled: true,
      supabaseServer: {
        from: vi.fn((table) =>
          table === 'login_users'
            ? { upsert: vi.fn(() => upsertResultChain) }
            : empChain
        ),
      },
    }));

    const route = await import('../../app/api/login/set-pin/route.js');
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
