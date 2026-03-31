import { getConnectionString, withPgClient } from "~/lib/pg.server";

export type EmployeeAuthRecord = {
  employee_id: string;
  date_of_birth: string | null;
  start_date: string | null;
  status: string | null;
};

const ACTIVE_EMPLOYEE_STATUSES = new Set([
  "active",
  "employee",
  "พนักงาน",
]);

export function normalizeEmployeeStatus(status: string | null | undefined) {
  return String(status || "").trim().toLowerCase();
}

export function isEmployeeAccountActive(status: string | null | undefined) {
  return ACTIVE_EMPLOYEE_STATUSES.has(normalizeEmployeeStatus(status));
}

export async function findEmployeeAuthRecord(empId: string, context: unknown) {
  const connectionString = getConnectionString(context);
  if (!connectionString) {
    throw new Error("DATABASE_URL_NOT_AVAILABLE");
  }

  return withPgClient(
    connectionString,
    async (client) => {
      const result = await client.query<EmployeeAuthRecord>(
        `SELECT employee_id,
                to_char(date_of_birth, 'YYYY-MM-DD') AS date_of_birth,
                to_char(start_date, 'YYYY-MM-DD') AS start_date,
                status
         FROM employees
         WHERE employee_id = $1
         LIMIT 1`,
        [empId],
      );
      return result.rows[0] || null;
    },
    1,
  );
}
