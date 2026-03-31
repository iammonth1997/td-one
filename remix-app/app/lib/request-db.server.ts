import type { Client } from "pg";

import type { UploadedRequestAttachment } from "~/lib/request-attachments.server";
import { getConnectionString, withPgClient } from "~/lib/pg.server";

export type RequestAccessScope = {
  canReviewAll: boolean;
  departmentId: number | null;
};

export type RequestStatusCountRow = {
  status: string;
  count: number;
};

export type DepartmentRequestListRow = {
  id: string;
  request_type: string;
  status: string;
  created_at: string | Date;
  created_by_id: string;
  total_days: number | null;
  requires_approval: boolean;
  created_by_name: string;
  employee_count: number;
  employee_preview: string;
};

export type RequestAttachmentRow = {
  id: string;
  file_name: string;
  file_url: string;
  file_size: number;
  mime_type: string;
  file_public_id: string | null;
  file_resource_type: string | null;
  uploaded_at: string | Date;
};

export type RequestRecordRow = {
  id: string;
  request_type: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  half_day: string | null;
  total_days: number | null;
  work_dates: unknown;
  work_hours: number | null;
  last_working_day: string | null;
  reason: string | null;
  is_twins: boolean;
  created_by_id: string;
  department_id: number;
  approved_by_id: string | null;
  approved_at: string | Date | null;
  rejection_reason: string | null;
  requires_approval: boolean;
  created_at: string | Date;
  updated_at: string | Date;
};

export type RequestRecordWithRelations = RequestRecordRow & {
  employees: Array<{ employee_id: string }>;
  attachments: RequestAttachmentRow[];
};

export type SelectableEmployeeRow = {
  employee_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name_en: string | null;
  full_name_lo: string | null;
  position: string | null;
};

export type UpsertRequestInput = {
  requestId?: string;
  requestType: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  halfDay: string | null;
  totalDays: number | null;
  workDates: unknown;
  workHours: number | null;
  lastWorkingDay: string | null;
  reason: string | null;
  isTwins: boolean;
  createdById: string;
  departmentId: number;
  requiresApproval: boolean;
  employeeIds: string[];
  attachments: UploadedRequestAttachment[];
};

function getRequestConnectionString(context: unknown) {
  const connectionString = getConnectionString(context);
  if (!connectionString) {
    throw new Error("REQUEST_DB_CONNECTION_STRING_MISSING");
  }
  return connectionString;
}

async function withRequestDbClient<T>(context: unknown, fn: (client: Client) => Promise<T>) {
  return withPgClient(getRequestConnectionString(context), fn);
}

async function runTransaction<T>(client: Client, fn: () => Promise<T>) {
  await client.query("BEGIN");
  try {
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

function appendScopeCondition(alias: string, scope: RequestAccessScope, conditions: string[], values: unknown[]) {
  if (!scope.canReviewAll) {
    values.push(scope.departmentId ?? -1);
    conditions.push(`${alias}.department_id = $${values.length}`);
  }
}

function buildVisibleEmployeeSql(hasPreservedEmployees: boolean) {
  if (hasPreservedEmployees) {
    return `AND (LOWER(COALESCE(e.status, '')) = LOWER($2) OR e.employee_id = ANY($3::varchar[]))`;
  }

  return `AND LOWER(COALESCE(e.status, '')) = LOWER($2)`;
}

export async function loadRequestListData(
  context: unknown,
  scope: RequestAccessScope,
  activeView: "pending" | "approved" | "rejected",
) {
  return withRequestDbClient(context, async (client) => {
    const countValues: unknown[] = [["PENDING", "APPROVED", "SUBMITTED", "REJECTED"]];
    const countConditions = [`status = ANY($1::varchar[])`];
    appendScopeCondition("", scope, countConditions, countValues);
    const normalizedCountConditions = countConditions.map((condition) =>
      condition.startsWith(".") ? condition.slice(1) : condition,
    );

    const countResult = await client.query<{ status: string; count: string | number }>(
      `SELECT status, COUNT(*)::int AS count
       FROM requests
       WHERE ${normalizedCountConditions.join(" AND ")}
       GROUP BY status`,
      countValues,
    );

    const viewStatuses =
      activeView === "approved"
        ? ["APPROVED", "SUBMITTED"]
        : activeView === "rejected"
          ? ["REJECTED"]
          : ["PENDING"];

    const listValues: unknown[] = [viewStatuses];
    const listConditions = [`r.status = ANY($1::varchar[])`];
    appendScopeCondition("r", scope, listConditions, listValues);

    const listResult = await client.query<DepartmentRequestListRow>(
      `SELECT
         r.id,
         r.request_type,
         r.status,
         r.created_at,
         r.created_by_id,
         r.total_days,
         r.requires_approval,
         COALESCE(
           NULLIF(TRIM(CONCAT_WS(' ', creator.first_name, creator.last_name)), ''),
           NULLIF(creator.full_name_lo, ''),
           NULLIF(creator.full_name_en, ''),
           '-'
         ) AS created_by_name,
         COALESCE((
           SELECT COUNT(*)::int
           FROM request_employees re_count
           WHERE re_count.request_id = r.id
         ), 0) AS employee_count,
         COALESCE((
           SELECT string_agg(preview.display_name, ', ' ORDER BY preview.employee_id)
           FROM (
             SELECT
               re.employee_id,
               COALESCE(
                 NULLIF(TRIM(CONCAT_WS(' ', e.first_name, e.last_name)), ''),
                 NULLIF(e.full_name_lo, ''),
                 NULLIF(e.full_name_en, ''),
                 '-'
               ) AS display_name
             FROM request_employees re
             JOIN employees e ON e.employee_id = re.employee_id
             WHERE re.request_id = r.id
             ORDER BY re.employee_id ASC
             LIMIT 3
           ) AS preview
         ), '') AS employee_preview
       FROM requests r
       LEFT JOIN employees creator ON creator.employee_id = r.created_by_id
       WHERE ${listConditions.join(" AND ")}
       ORDER BY r.created_at DESC
       LIMIT 100`,
      listValues,
    );

    return {
      statusCountsRows: countResult.rows.map((row) => ({
        status: row.status,
        count: Number(row.count) || 0,
      })),
      requestRows: listResult.rows.map((row) => ({
        ...row,
        employee_count: Number(row.employee_count) || 0,
        total_days: row.total_days == null ? null : Number(row.total_days),
      })),
    };
  });
}

export async function findRequestRecordById(
  context: unknown,
  scope: RequestAccessScope,
  requestId: string,
) {
  return withRequestDbClient(context, async (client) => {
    const values: unknown[] = [requestId];
    const conditions = [`id = $1`];
    appendScopeCondition("", scope, conditions, values);
    const normalizedConditions = conditions.map((condition) =>
      condition.startsWith(".") ? condition.slice(1) : condition,
    );

    const requestResult = await client.query<RequestRecordRow>(
      `SELECT
         id,
         request_type,
         status,
         start_date,
         end_date,
         half_day,
         total_days,
         work_dates,
         work_hours,
         last_working_day,
         reason,
         is_twins,
         created_by_id,
         department_id,
         approved_by_id,
         approved_at,
         rejection_reason,
         requires_approval,
         created_at,
         updated_at
       FROM requests
       WHERE ${normalizedConditions.join(" AND ")}
       LIMIT 1`,
      values,
    );

    const requestRow = requestResult.rows[0];
    if (!requestRow) {
      return null;
    }

    const [employeesResult, attachmentsResult] = await Promise.all([
      client.query<{ employee_id: string }>(
        `SELECT employee_id
         FROM request_employees
         WHERE request_id = $1
         ORDER BY employee_id ASC`,
        [requestId],
      ),
      client.query<RequestAttachmentRow>(
        `SELECT
           id,
           file_name,
           file_url,
           file_size,
           mime_type,
           file_public_id,
           file_resource_type,
           uploaded_at
         FROM request_attachments
         WHERE request_id = $1
         ORDER BY uploaded_at ASC, id ASC`,
        [requestId],
      ),
    ]);

    return {
      ...requestRow,
      total_days: requestRow.total_days == null ? null : Number(requestRow.total_days),
      work_hours: requestRow.work_hours == null ? null : Number(requestRow.work_hours),
      employees: employeesResult.rows,
      attachments: attachmentsResult.rows.map((attachment) => ({
        ...attachment,
        file_size: Number(attachment.file_size) || 0,
      })),
    } satisfies RequestRecordWithRelations;
  });
}

export async function listSelectableEmployees(
  context: unknown,
  departmentId: number,
  visibleStatus: string,
  preservedEmployeeIds: string[] = [],
) {
  return withRequestDbClient(context, async (client) => {
    const values: unknown[] = [departmentId, visibleStatus];
    const sql = buildVisibleEmployeeSql(preservedEmployeeIds.length > 0);
    if (preservedEmployeeIds.length > 0) {
      values.push(preservedEmployeeIds);
    }

    const result = await client.query<SelectableEmployeeRow>(
      `SELECT
         e.employee_id,
         e.first_name,
         e.last_name,
         e.full_name_en,
         e.full_name_lo,
         e.position
       FROM employees e
       WHERE e.department_id = $1
       ${sql}
       ORDER BY e.employee_id ASC`,
      values,
    );

    return result.rows;
  });
}

export async function listScopedEmployeesByIds(
  context: unknown,
  departmentId: number,
  employeeIds: string[],
  visibleStatus: string,
  preservedEmployeeIds: string[] = [],
) {
  if (employeeIds.length === 0) {
    return [];
  }

  return withRequestDbClient(context, async (client) => {
    const values: unknown[] = [departmentId, employeeIds, visibleStatus];
    const preservedSql =
      preservedEmployeeIds.length > 0
        ? `AND (LOWER(COALESCE(e.status, '')) = LOWER($3) OR e.employee_id = ANY($4::varchar[]))`
        : `AND LOWER(COALESCE(e.status, '')) = LOWER($3)`;
    if (preservedEmployeeIds.length > 0) {
      values.push(preservedEmployeeIds);
    }

    const result = await client.query<{ employee_id: string }>(
      `SELECT e.employee_id
       FROM employees e
       WHERE e.department_id = $1
         AND e.employee_id = ANY($2::varchar[])
         ${preservedSql}`,
      values,
    );

    return result.rows;
  });
}

export async function createRequestRecord(context: unknown, input: UpsertRequestInput) {
  return withRequestDbClient(context, async (client) => {
    const requestId = crypto.randomUUID();
    await runTransaction(client, async () => {
      await client.query(
        `INSERT INTO requests (
           id,
           request_type,
           status,
           start_date,
           end_date,
           half_day,
           total_days,
           work_dates,
           work_hours,
           last_working_day,
           reason,
           is_twins,
           created_by_id,
           department_id,
           requires_approval
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8::json, $9, $10, $11, $12, $13, $14, $15
         )`,
        [
          requestId,
          input.requestType,
          input.status,
          input.startDate,
          input.endDate,
          input.halfDay,
          input.totalDays,
          input.workDates == null ? null : JSON.stringify(input.workDates),
          input.workHours,
          input.lastWorkingDay,
          input.reason,
          input.isTwins,
          input.createdById,
          input.departmentId,
          input.requiresApproval,
        ],
      );

      for (const employeeId of input.employeeIds) {
        await client.query(
          `INSERT INTO request_employees (id, request_id, employee_id)
           VALUES ($1, $2, $3)`,
          [crypto.randomUUID(), requestId, employeeId],
        );
      }

      for (const attachment of input.attachments) {
        await client.query(
          `INSERT INTO request_attachments (
             id,
             request_id,
             file_name,
             file_url,
             file_size,
             mime_type,
             file_public_id,
             file_resource_type
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            crypto.randomUUID(),
            requestId,
            attachment.fileName,
            attachment.fileUrl,
            attachment.fileSize,
            attachment.mimeType,
            attachment.publicId,
            attachment.resourceType,
          ],
        );
      }
    });

    return requestId;
  });
}

export async function updateRequestRecord(context: unknown, input: UpsertRequestInput & { requestId: string }) {
  return withRequestDbClient(context, async (client) => {
    await runTransaction(client, async () => {
      await client.query(
        `UPDATE requests
         SET
           request_type = $2,
           status = $3,
           start_date = $4,
           end_date = $5,
           half_day = $6,
           total_days = $7,
           work_dates = $8::json,
           work_hours = $9,
           last_working_day = $10,
           reason = $11,
           is_twins = $12,
           department_id = $13,
           requires_approval = $14,
           approved_by_id = NULL,
           approved_at = NULL,
           rejection_reason = NULL,
           updated_at = NOW()
         WHERE id = $1`,
        [
          input.requestId,
          input.requestType,
          input.status,
          input.startDate,
          input.endDate,
          input.halfDay,
          input.totalDays,
          input.workDates == null ? null : JSON.stringify(input.workDates),
          input.workHours,
          input.lastWorkingDay,
          input.reason,
          input.isTwins,
          input.departmentId,
          input.requiresApproval,
        ],
      );

      await client.query(`DELETE FROM request_employees WHERE request_id = $1`, [input.requestId]);

      for (const employeeId of input.employeeIds) {
        await client.query(
          `INSERT INTO request_employees (id, request_id, employee_id)
           VALUES ($1, $2, $3)`,
          [crypto.randomUUID(), input.requestId, employeeId],
        );
      }

      for (const attachment of input.attachments) {
        await client.query(
          `INSERT INTO request_attachments (
             id,
             request_id,
             file_name,
             file_url,
             file_size,
             mime_type,
             file_public_id,
             file_resource_type
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            crypto.randomUUID(),
            input.requestId,
            attachment.fileName,
            attachment.fileUrl,
            attachment.fileSize,
            attachment.mimeType,
            attachment.publicId,
            attachment.resourceType,
          ],
        );
      }
    });
  });
}

export async function deleteRequestRecord(context: unknown, requestId: string) {
  return withRequestDbClient(context, async (client) => {
    await client.query(`DELETE FROM requests WHERE id = $1`, [requestId]);
  });
}

export async function updateRequestDecision(
  context: unknown,
  requestId: string,
  nextStatus: "APPROVED" | "REJECTED",
  approvedById: string,
  rejectionReason: string | null,
) {
  return withRequestDbClient(context, async (client) => {
    await client.query(
      `UPDATE requests
       SET
         status = $2,
         approved_by_id = $3,
         approved_at = NOW(),
         rejection_reason = $4,
         updated_at = NOW()
       WHERE id = $1`,
      [requestId, nextStatus, approvedById, rejectionReason],
    );
  });
}
