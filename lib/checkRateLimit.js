import { getPrisma } from "@/lib/prisma";

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;
const LOCKOUT_MINUTES = 15;

/**
 * Check if an emp_id is rate-limited.
 * @param {string} empId
 * @returns {Promise<{ locked: boolean, minutesRemaining: number|null }>}
 */
export async function checkRateLimit(empId) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
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
      return { locked: false, minutesRemaining: null };
    }

    const oldestTime = new Date(data[data.length - 1].attempted_at).getTime();
    const lockExpiresAt = oldestTime + LOCKOUT_MINUTES * 60 * 1000;
    const minutesRemaining = Math.ceil((lockExpiresAt - Date.now()) / 60000);

    if (minutesRemaining <= 0) {
      return { locked: false, minutesRemaining: null };
    }

    return { locked: true, minutesRemaining };
  } catch (err) {
    console.error("checkRateLimit query failed:", err.message);
    return { locked: false, minutesRemaining: null };
  }
}

/**
 * Record a login attempt.
 */
export async function recordLoginAttempt(empId, success, ipAddress = null) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  await prisma.authLoginAttempt.create({
    data: { emp_id: empId, success, ip_address: ipAddress },
  });
}

/**
 * Clear recent failed attempts for an emp_id (on successful login).
 */
export async function clearFailedAttempts(empId) {
  const prisma = getPrisma({ DATABASE_URL: process.env.DATABASE_URL });
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);

  await prisma.authLoginAttempt.deleteMany({
    where: {
      emp_id: empId,
      success: false,
      attempted_at: { gte: windowStart },
    },
  });
}
