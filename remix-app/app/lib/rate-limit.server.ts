import prisma from "~/lib/prisma.server";

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;
const LOCKOUT_MINUTES = 15;

export async function checkRateLimit(empId: string) {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);

  try {
    const data = await prisma.authLoginAttempt.findMany({
      where: {
        emp_id: empId,
        success: false,
        attempted_at: { gte: windowStart },
      },
      orderBy: { attempted_at: "desc" },
      take: MAX_ATTEMPTS,
      select: { attempted_at: true },
    });

    if (!data || data.length < MAX_ATTEMPTS) {
      return { locked: false, minutesRemaining: null as number | null };
    }

    const oldestTime = new Date(data[data.length - 1].attempted_at).getTime();
    const lockExpiresAt = oldestTime + LOCKOUT_MINUTES * 60 * 1000;
    const minutesRemaining = Math.ceil((lockExpiresAt - Date.now()) / 60000);

    if (minutesRemaining <= 0) {
      return { locked: false, minutesRemaining: null as number | null };
    }

    return { locked: true, minutesRemaining };
  } catch (err) {
    console.error("checkRateLimit query failed:", err);
    return { locked: false, minutesRemaining: null as number | null };
  }
}

export async function recordLoginAttempt(
  empId: string,
  success: boolean,
  ipAddress: string | null = null
) {
  await prisma.authLoginAttempt.create({
    data: { emp_id: empId, success, ip_address: ipAddress },
  });
}

export async function clearFailedAttempts(empId: string) {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);

  await prisma.authLoginAttempt.deleteMany({
    where: {
      emp_id: empId,
      success: false,
      attempted_at: { gte: windowStart },
    },
  });
}
