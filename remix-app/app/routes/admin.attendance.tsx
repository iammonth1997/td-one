import type { Route } from "./+types/admin.attendance";
import { requireAdminSession } from "~/lib/require-admin-session.server";
import AdminShell from "~/components/admin-shell";

type AttendanceRow = {
  id: string;
  emp_id?: string | null;
  status?: string | null;
  check_in_at?: string | null;
  check_out_at?: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);

  const url = new URL(request.url);
  url.pathname = "/api/attendance/today";

  const res = await fetch(url.toString(), {
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const rows = Array.isArray(data.rows)
    ? (data.rows as AttendanceRow[])
    : Array.isArray(data.records)
      ? (data.records as AttendanceRow[])
      : [];

  const checkedInCount = rows.filter((row) => Boolean(row.check_in_at)).length;

  return { session, rows, checkedInCount };
}

export default function AdminAttendancePage({ loaderData }: Route.ComponentProps) {
  const rows = loaderData.rows;
  const checkedInCount = loaderData.checkedInCount;

  return (
    <AdminShell title="Attendance" session={loaderData.session}>
      <section className="mb-4 rounded-xl border border-[#d8dee8] bg-white p-4 shadow-sm">
        <p className="text-sm text-[#5b6d85]">Today Checked In</p>
        <p className="text-2xl font-bold text-[#1b2738]">{checkedInCount}</p>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Today Attendance Records</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">EMP ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">CHECK IN</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">CHECK OUT</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3">{row.emp_id || "-"}</td>
                  <td className="px-4 py-3">{row.check_in_at ? new Date(row.check_in_at).toLocaleString("th-TH") : "-"}</td>
                  <td className="px-4 py-3">{row.check_out_at ? new Date(row.check_out_at).toLocaleString("th-TH") : "-"}</td>
                  <td className="px-4 py-3">{row.status || "-"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[#8a97ac]">No attendance data</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
