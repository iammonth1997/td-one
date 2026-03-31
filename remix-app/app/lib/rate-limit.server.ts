import prisma from "~/lib/prisma.server";
import { getConnectionString, withPgClient } from "~/lib/pg.server";

const MAX_ATTEMPTS = 5;
const WINDOW_MINUTES = 15;
const LOCKOUT_MINUTES = 15;

type AttemptRow = {
  attempted_at: Date | string;
};

export async function checkRateLimit(empId: string, context?: unknown) {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
  const connectionString = getConnectionString(context);

  if (connectionString) {
    try {
      const data = await withPgClient(
        connectionString,
        async (client) => {
          const result = await client.query<AttemptRow>(
            `SELECT attempted_at
             FROM auth_login_attempts
             WHERE emp_id = $1
               AND success = false
               AND attempted_at >= $2
             ORDER BY attempted_at DESC
             LIMIT $3`,
            [empId, windowStart, MAX_ATTEMPTS],
          );
          return result.rows;
        },
        1,
      );

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
      console.error("checkRateLimit pg query failed:", err);
    }
  }

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
    console.error("checkRateLimit prisma query failed:", err);
    return { locked: false, minutesRemaining: null as number | null };
  }
}

export async function recordLoginAttempt(
  empId: string,
  success: boolean,
  ipAddress: string | null = null,
  context?: unknown,
) {
  const connectionString = getConnectionString(context);

  if (connectionString) {
    try {
      await withPgClient(
        connectionString,
        async (client) => {
          await client.query(
            `INSERT INTO auth_login_attempts (id, emp_id, success, ip_address, attempted_at)
             VALUES ($1, $2, $3, $4, NOW())`,
            [crypto.randomUUID(), empId, success, ipAddress],
          );
        },
        1,
      );
      return;
    } catch (err) {
      console.error("recordLoginAttempt pg insert failed:", err);
    }
  }

  try {
    await prisma.authLoginAttempt.create({
      data: { emp_id: empId, success, ip_address: ipAddress },
    });
  } catch (err) {
    console.error("recordLoginAttempt prisma insert failed:", err);
  }
}

export async function clearFailedAttempts(empId: string, context?: unknown) {
  const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60 * 1000);
  const connectionString = getConnectionString(context);

  if (connectionString) {
    try {
      await withPgClient(
        connectionString,
        async (client) => {
          await client.query(
            `DELETE FROM auth_login_attempts
             WHERE emp_id = $1
               AND success = false
               AND attempted_at >= $2`,
            [empId, windowStart],
          );
        },
        1,
      );
      return;
    } catch (err) {
      console.error("clearFailedAttempts pg delete failed:", err);
    }
  }

  try {
    await prisma.authLoginAttempt.deleteMany({
      where: {
        emp_id: empId,
        success: false,
        attempted_at: { gte: windowStart },
      },
    });
  } catch (err) {
    console.error("clearFailedAttempts prisma delete failed:", err);
  }
}
