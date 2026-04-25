async function hashToken(token) {
  const enc = new TextEncoder();
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function getRawSalaryToken(request) {
  const salaryHeader = request.headers.get("x-salary-token");
  if (salaryHeader) {
    return salaryHeader.startsWith("SalaryToken ") ? salaryHeader.slice(12).trim() : salaryHeader.trim();
  }

  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("SalaryToken ")) {
    return authHeader.slice(12).trim();
  }

  return null;
}

export async function requireSalaryAccess(prisma, request) {
  const rawToken = getRawSalaryToken(request);
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
    console.error("requireSalaryAccess DB error:", dbErr);
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
