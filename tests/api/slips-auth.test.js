import { beforeEach, describe, expect, it, vi } from "vitest";
import { mockPrismaModule } from "./prisma-test-helper.js";

describe("payslip salary token enforcement", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("rejects salary slip requests without a salary token", async () => {
    vi.doMock("@/lib/prisma", () => mockPrismaModule({
      salarySession: { findUnique: vi.fn() },
    }));
    vi.doMock("@/lib/otRequestUtils", () => ({
      getEmployeeByEmpCode: vi.fn(),
    }));

    const { GET } = await import("../../server/api/salary-slip/route.js");
    const res = await GET(new Request("http://localhost/api/salary-slip?year=2026&month=4"));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "MISSING_SALARY_TOKEN" });
  });

  it("returns salary slip data for a valid salary token", async () => {
    vi.doMock("@/lib/prisma", () => mockPrismaModule({
      salarySession: {
        findUnique: vi.fn(async () => ({
          emp_id: "EMP001",
          expires_at: new Date(Date.now() + 60_000),
        })),
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
      salarySlip: {
        findFirst: vi.fn(async () => ({
          id: "sal-1",
          employee_id: "emp-uuid-1",
          year: 2026,
          month: 4,
          net_salary: 12345,
        })),
      },
    }));
    vi.doMock("@/lib/otRequestUtils", () => ({
      getEmployeeByEmpCode: vi.fn(async () => ({
        employee: {
          id: "emp-uuid-1",
          name: "Test Employee",
          employee_code: "EMP001",
        },
        error: null,
      })),
    }));

    const { GET } = await import("../../server/api/salary-slip/route.js");
    const res = await GET(new Request("http://localhost/api/salary-slip?year=2026&month=4", {
      headers: { "x-salary-token": "SalaryToken valid-salary-token" },
    }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      employee: { employee_code: "EMP001" },
      slip: { id: "sal-1", net_salary: 12345 },
    });
  });

  it("rejects OT slip requests with a non-salary token", async () => {
    vi.doMock("@/lib/prisma", () => mockPrismaModule({
      salarySession: {
        findUnique: vi.fn(async () => null),
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
    }));
    vi.doMock("@/lib/otRequestUtils", () => ({
      getEmployeeByEmpCode: vi.fn(),
    }));

    const { GET } = await import("../../server/api/ot-slip/route.js");
    const res = await GET(new Request("http://localhost/api/ot-slip?year=2026&month=4", {
      headers: { authorization: "Bearer ordinary-session-token" },
    }));
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toMatchObject({ error: "MISSING_SALARY_TOKEN" });
  });

  it("returns OT slip data for a valid salary token", async () => {
    vi.doMock("@/lib/prisma", () => mockPrismaModule({
      salarySession: {
        findUnique: vi.fn(async () => ({
          emp_id: "EMP001",
          expires_at: new Date(Date.now() + 60_000),
        })),
        deleteMany: vi.fn(async () => ({ count: 0 })),
      },
      otSlip: {
        findFirst: vi.fn(async () => ({
          id: "ot-1",
          employee_id: "emp-uuid-1",
          year: 2026,
          month: 4,
          total_ot_incentive: 6789,
        })),
      },
    }));
    vi.doMock("@/lib/otRequestUtils", () => ({
      getEmployeeByEmpCode: vi.fn(async () => ({
        employee: {
          id: "emp-uuid-1",
          name: "Test Employee",
          employee_code: "EMP001",
        },
        error: null,
      })),
    }));

    const { GET } = await import("../../server/api/ot-slip/route.js");
    const res = await GET(new Request("http://localhost/api/ot-slip?year=2026&month=4", {
      headers: { "x-salary-token": "SalaryToken valid-salary-token" },
    }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      success: true,
      employee: { employee_code: "EMP001" },
      slip: { id: "ot-1", total_ot_incentive: 6789 },
    });
  });
});
