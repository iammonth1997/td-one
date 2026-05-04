import { parse } from "csv-parse/sync";
import { Form, useActionData } from "react-router";
import {
  unstable_createMemoryUploadHandler,
  unstable_parseMultipartFormData,
} from "@remix-run/node";

import type { Route } from "./+types/admin.upload-slip";
import AdminShell from "~/components/admin-shell";
import { requireAdminSession } from "~/lib/require-admin-session.server";

type CsvRow = Record<string, string | null | undefined>;

type DbClient = {
  query: (sql: string, params?: unknown[]) => Promise<unknown>;
};

type ActionData = {
  error?: string;
  message?: string;
};

const UPSERT_WORK_SLIP_SQL = `
  INSERT INTO work_slip (
    employee_code,
    month,
    year,
    work_days,
    rt_days,
    rtf_days,
    sl_days,
    pl_days,
    vl_days,
    vf_days,
    opl_days,
    x_days,
    no_scan,
    no_scan_in,
    no_scan_out,
    total_unpaid,
    total_leave,
    total_paid,
    night_shift_count,
    sl_dates,
    pl_dates,
    vl_dates,
    vf_dates,
    off_dates,
    opl_dates,
    x_dates,
    work_dates,
    night_shift_dates,
    uploaded_at
  )
  VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
    $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
    $21, $22, $23, $24, $25, $26, $27, $28, $29
  )
  ON CONFLICT (employee_code, month, year)
  DO UPDATE SET
    work_days=EXCLUDED.work_days,
    rt_days=EXCLUDED.rt_days,
    rtf_days=EXCLUDED.rtf_days,
    sl_days=EXCLUDED.sl_days,
    pl_days=EXCLUDED.pl_days,
    vl_days=EXCLUDED.vl_days,
    vf_days=EXCLUDED.vf_days,
    opl_days=EXCLUDED.opl_days,
    x_days=EXCLUDED.x_days,
    no_scan=EXCLUDED.no_scan,
    no_scan_in=EXCLUDED.no_scan_in,
    no_scan_out=EXCLUDED.no_scan_out,
    total_unpaid=EXCLUDED.total_unpaid,
    total_leave=EXCLUDED.total_leave,
    total_paid=EXCLUDED.total_paid,
    night_shift_count=EXCLUDED.night_shift_count,
    sl_dates=EXCLUDED.sl_dates,
    pl_dates=EXCLUDED.pl_dates,
    vl_dates=EXCLUDED.vl_dates,
    vf_dates=EXCLUDED.vf_dates,
    off_dates=EXCLUDED.off_dates,
    opl_dates=EXCLUDED.opl_dates,
    x_dates=EXCLUDED.x_dates,
    work_dates=EXCLUDED.work_dates,
    night_shift_dates=EXCLUDED.night_shift_dates,
    uploaded_at=CURRENT_TIMESTAMP
`;

function getDbClient(context: unknown) {
  const ctx = context as {
    env?: { DB?: DbClient };
    cloudflare?: { env?: { DB?: DbClient } };
  };
  const db = ctx.env?.DB ?? ctx.cloudflare?.env?.DB;

  if (!db?.query) {
    throw new Error("context.env.DB is not available");
  }

  return db;
}

function parseIntCell(value: string | null | undefined) {
  return parseInt(String(value ?? ""), 10) || 0;
}

function parseTextCell(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === "-" || trimmed.toLowerCase() === "nan") return null;
  return trimmed;
}

function stringCell(value: string | null | undefined) {
  return String(value ?? "").trim();
}

function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { size?: unknown }).size === "number" &&
    typeof (value as { text?: unknown }).text === "function"
  );
}

function valuesFromRow(row: CsvRow) {
  const employeeCode = stringCell(row["Employee Code"]);
  const month = stringCell(row["Month"]);
  const year = parseIntCell(row["Year"]);

  if (!employeeCode || !month || !year) {
    throw new Error("CSV row is missing Employee Code, Month, or Year");
  }

  return [
    employeeCode,
    month,
    year,
    parseIntCell(row["Workday"]),
    parseIntCell(row["Request_time (RT)"]),
    parseIntCell(row["Request_time_false (RTF)"]),
    parseIntCell(row["SL"]),
    parseIntCell(row["PL"]),
    parseIntCell(row["VL"]),
    parseIntCell(row["VF"]),
    parseIntCell(row["OPL"]),
    parseIntCell(row["X"]),
    parseIntCell(row["No_Scan"]),
    parseIntCell(row["No_Scan_In"]),
    parseIntCell(row["No_Scan_Out"]),
    parseIntCell(row["Total_unpaid"]),
    parseIntCell(row["Total_leave"]),
    parseIntCell(row["Total_paid"]),
    parseIntCell(row["Total_Night_Shift"]),
    parseTextCell(row["SL_dates"]),
    parseTextCell(row["PL_dates"]),
    parseTextCell(row["VL_dates"]),
    parseTextCell(row["VF_dates"]),
    parseTextCell(row["OFF_dates"]),
    parseTextCell(row["OPL_dates"]),
    parseTextCell(row["X_dates"]),
    parseTextCell(row["work_dates"]),
    parseTextCell(row["night_shift_dates"]),
    new Date().toISOString(),
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);
  return { session };
}

export async function action({ request, context }: Route.ActionArgs): Promise<ActionData> {
  await requireAdminSession(request, context);

  try {
    const uploadHandler = unstable_createMemoryUploadHandler({
      maxPartSize: 10 * 1024 * 1024,
    });
    const formData = await unstable_parseMultipartFormData(request, uploadHandler);
    const file = formData.get("csv");

    if (!isUploadedFile(file) || file.size === 0) {
      return { error: "กรุณาเลือกไฟล์ CSV" };
    }

    const csvText = await file.text();
    const rows = parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as CsvRow[];

    if (rows.length === 0) {
      return { error: "ไม่พบข้อมูลในไฟล์ CSV" };
    }

    const db = getDbClient(context);
    let uploadedCount = 0;

    for (const row of rows) {
      await db.query(UPSERT_WORK_SLIP_SQL, valuesFromRow(row));
      uploadedCount += 1;
    }

    return { message: `อัปโหลดสำเร็จ ${uploadedCount} รายการ` };
  } catch (error) {
    console.error("admin upload slip failed:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return { error: `อัปโหลดไม่สำเร็จ: ${message}` };
  }
}

export default function AdminUploadSlipPage({ loaderData }: Route.ComponentProps) {
  const actionData = useActionData<ActionData>();

  return (
    <AdminShell title="Upload Work Slip" session={loaderData.session}>
      <section className="mx-auto max-w-lg rounded-xl border border-[#d8dee8] bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-[#1b2738]">Upload Work Slip CSV</h2>
          <p className="mt-1 text-sm text-[#6b7890]">
            Upload a CSV file to insert or update records in the work_slip table.
          </p>
        </div>

        <Form method="post" encType="multipart/form-data" className="mt-5 space-y-4">
          <div>
            <label htmlFor="csv" className="mb-2 block text-sm font-medium text-[#34435a]">
              CSV file
            </label>
            <input
              id="csv"
              name="csv"
              type="file"
              accept=".csv"
              required
              className="block w-full rounded-lg border border-gray-300 px-4 py-3 text-base file:mr-4 file:rounded-md file:border-0 file:bg-[#FEF2F2] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-[#991B1B] focus:outline-none focus:ring-2 focus:ring-red-400"
            />
          </div>

          {actionData?.message ? (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {actionData.message}
            </p>
          ) : null}

          {actionData?.error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {actionData.error}
            </p>
          ) : null}

          <button
            type="submit"
            className="w-full rounded-lg bg-[#DC2626] px-4 py-3 text-base font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.22)] transition hover:bg-[#991B1B]"
          >
            Upload CSV
          </button>
        </Form>
      </section>
    </AdminShell>
  );
}
