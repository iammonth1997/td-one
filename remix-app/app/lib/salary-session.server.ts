import prisma from "~/lib/prisma.server";

async function hashToken(token: string): Promise<string> {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function validateSalarySession(
  request: Request
): Promise<{ emp_id: string | null; error: string | null }> {
  const authHeader = request.headers.get("x-salary-token") || request.headers.get("authorization");
  let rawToken: string | null = null;

  if (authHeader?.startsWith("SalaryToken ")) {
    rawToken = authHeader.slice(12).trim();
  }

  if (!rawToken) {
    return { emp_id: null, error: "MISSING_SALARY_TOKEN" };
  }

  const tokenHash = await hashToken(rawToken);

  let data;
  try {
    data = await prisma.salarySession.findUnique({
      where: { token_hash: tokenHash },
      select: { emp_id: true, expires_at: true },
    });
  } catch (dbErr) {
    console.error("validateSalarySession DB error:", dbErr);
    return { emp_id: null, error: "SESSION_VALIDATION_FAILED" };
  }

  if (!data) {
    return { emp_id: null, error: "INVALID_SALARY_TOKEN" };
  }

  if (new Date(data.expires_at) < new Date()) {
    await prisma.salarySession.deleteMany({ where: { token_hash: tokenHash } });
    return { emp_id: null, error: "SALARY_TOKEN_EXPIRED" };
  }

  return { emp_id: data.emp_id, error: null };
}
