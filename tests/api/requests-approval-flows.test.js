import { beforeEach, describe, expect, it, vi } from "vitest";

function makeApproveSession() {
  return { is_admin: true, emp_id: "ADMIN01", role: "admin" };
}

function makeSelectChain(row) {
  return {
    eq: vi.fn(() => ({
      maybeSingle: vi.fn(async () => ({ data: row, error: null })),
    })),
  };
}

function makeUpdateChain(updatedRow, capture) {
  return {
    eq: vi.fn(() => ({
      select: vi.fn(() => ({
        maybeSingle: vi.fn(async () => ({ data: updatedRow, error: null })),
      })),
    })),
    withPatch: (patch) => {
      capture.patch = patch;
      return {
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: updatedRow, error: null })),
          })),
        })),
      };
    },
  };
}

describe("request approval flows", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("leave approve uses approver UUID in approved_by", async () => {
    const capture = { patch: null };
    const existing = { id: "lv1", employee_id: "emp-1", leave_type_code: "annual", status: "pending", attachment_url: null };
    const updated = { ...existing, status: "approved", approved_by: "emp-admin-uuid" };

    vi.doMock("@/lib/validateSession", () => ({
      validateSession: vi.fn(async () => ({ session: makeApproveSession(), error: null, status: 200 })),
    }));
    vi.doMock("@/lib/otRequestUtils", () => ({
      getEmployeeByEmpCode: vi.fn(async () => ({ employee: { id: "emp-admin-uuid" }, error: null })),
    }));
    vi.doMock("@/lib/rbac/sessionAccess", () => ({
      buildSessionAccessProfile: vi.fn(() => ({ role: "admin" })),
      canManageAdminActions: vi.fn(() => true),
    }));
    vi.doMock("@/lib/rbac/access", () => ({
      hasAnyPermission: vi.fn(() => true),
    }));

    const updateChain = makeUpdateChain(updated, capture);
    vi.doMock("@/lib/supabaseServer", () => ({
      supabaseServer: {
        from: vi.fn(() => ({
          select: vi.fn(() => makeSelectChain(existing)),
          update: vi.fn((patch) => updateChain.withPatch(patch)),
        })),
      },
    }));

    const { PUT } = await import("../../server/api/leave-request/[id]/route.js");
    const req = new Request("http://localhost/api/leave-request/lv1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "approve" }),
    });
    const res = await PUT(req);

    expect(res.status).toBe(200);
    expect(capture.patch.status).toBe("approved");
    expect(capture.patch.approved_by).toBe("emp-admin-uuid");
  });

  it("ot reject writes rejected_reason", async () => {
    const capture = { patch: null };
    const existing = { id: "ot1", employee_id: "emp-1", status: "pending" };
    const updated = { ...existing, status: "rejected", rejected_reason: "Not justified" };

    vi.doMock("@/lib/validateSession", () => ({
      validateSession: vi.fn(async () => ({ session: makeApproveSession(), error: null, status: 200 })),
    }));
    vi.doMock("@/lib/otRequestUtils", () => ({
      getEmployeeByEmpCode: vi.fn(async () => ({ employee: { id: "emp-admin-uuid" }, error: null })),
    }));
    vi.doMock("@/lib/rbac/sessionAccess", () => ({
      buildSessionAccessProfile: vi.fn(() => ({ role: "admin" })),
    }));
    vi.doMock("@/lib/rbac/access", () => ({
      hasAnyPermission: vi.fn(() => true),
    }));

    const updateChain = makeUpdateChain(updated, capture);
    vi.doMock("@/lib/supabaseServer", () => ({
      supabaseServer: {
        from: vi.fn(() => ({
          select: vi.fn(() => makeSelectChain(existing)),
          update: vi.fn((patch) => updateChain.withPatch(patch)),
        })),
      },
    }));

    const { PUT } = await import("../../server/api/ot-request/[id]/route.js");
    const req = new Request("http://localhost/api/ot-request/ot1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reject", reason: "Not justified" }),
    });
    const res = await PUT(req);

    expect(res.status).toBe(200);
    expect(capture.patch.status).toBe("rejected");
    expect(capture.patch.rejected_reason).toBe("Not justified");
  });

  it("time correction reject uses rejected_reason field", async () => {
    const capture = { patch: null };
    const existing = { id: "tc1", status: "pending" };
    const updated = { ...existing, status: "rejected", rejected_reason: "Invalid reason" };

    vi.doMock("@/lib/validateSession", () => ({
      validateSession: vi.fn(async () => ({ session: makeApproveSession(), error: null, status: 200 })),
    }));
    vi.doMock("@/lib/otRequestUtils", () => ({
      getEmployeeByEmpCode: vi.fn(async () => ({ employee: { id: "emp-admin-uuid" }, error: null })),
    }));
    vi.doMock("@/lib/rbac/sessionAccess", () => ({
      buildSessionAccessProfile: vi.fn(() => ({ role: "admin" })),
      canManageAdminActions: vi.fn(() => true),
    }));

    const updateChain = makeUpdateChain(updated, capture);
    vi.doMock("@/lib/supabaseServer", () => ({
      supabaseServer: {
        from: vi.fn(() => ({
          select: vi.fn(() => makeSelectChain(existing)),
          update: vi.fn((patch) => updateChain.withPatch(patch)),
        })),
      },
    }));

    const { PUT } = await import("../../server/api/time-correction-request/[id]/route.js");
    const req = new Request("http://localhost/api/time-correction-request/tc1", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reject", reason: "Invalid reason" }),
    });
    const res = await PUT(req);

    expect(res.status).toBe(200);
    expect(capture.patch.status).toBe("rejected");
    expect(capture.patch.rejected_reason).toBe("Invalid reason");
    expect(capture.patch.rejection_reason).toBeUndefined();
  });
});
