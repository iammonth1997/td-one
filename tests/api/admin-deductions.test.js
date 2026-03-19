import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('admin deductions API handler', () => {
  let GET;

  beforeEach(() => {
    vi.resetModules();
  });

  it('returns FORBIDDEN when session is not admin', async () => {
    vi.doMock('@/lib/validateSession', () => ({
      validateSession: vi.fn(async () => ({
        session: { is_admin: false },
        error: null,
        status: 200,
      })),
    }));

    vi.doMock('@/lib/supabaseServer', () => ({
      supabaseServer: {
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            order: vi.fn(async () => ({ data: [], error: null })),
            eq: vi.fn(async () => ({ count: 0, error: null })),
          })),
        })),
      },
    }));

    const route = await import('../../server/api/admin/deductions/route.js');
    GET = route.GET;

    const req = new Request('http://localhost/api/admin/deductions');
    const res = await GET(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe('FORBIDDEN');
  });

  it('returns templates and active count for admin', async () => {
    const templates = [
      { id: 't1', name: 'Loan', deduction_type: 'fixed', is_active: true },
      { id: 't2', name: 'SSI', deduction_type: 'percentage', is_active: true },
    ];

    const templatesChain = {
      order: vi.fn(async () => ({ data: templates, error: null })),
      select: vi.fn(() => templatesChain),
    };

    const countChain = {
      eq: vi.fn(async () => ({ count: 5, error: null })),
      select: vi.fn(() => countChain),
    };

    vi.doMock('@/lib/validateSession', () => ({
      validateSession: vi.fn(async () => ({
        session: { is_admin: true },
        error: null,
        status: 200,
      })),
    }));

    vi.doMock('@/lib/supabaseServer', () => ({
      supabaseServer: {
        from: vi.fn((table) => {
          if (table === 'deduction_templates') return templatesChain;
          if (table === 'employee_deductions') return countChain;
          return templatesChain;
        }),
      },
    }));

    const route = await import('../../server/api/admin/deductions/route.js');
    GET = route.GET;

    const req = new Request('http://localhost/api/admin/deductions');
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.templates).toHaveLength(2);
    expect(body.active_employee_deductions).toBe(5);
  });
});

