import type { Route } from "./+types/admin.attendance";
import { requireAdminSession } from "~/lib/require-admin-session.server";
import { fetchJsonOrEmpty } from "~/lib/safe-server-fetch.server";
import AdminShell from "~/components/admin-shell";

type AttendanceRow = {
  id: string;
  employee_code?: string | null;
  scan_timestamp?: string | null;
  suspicion_score?: number | null;
  suspicion_flags?: string[] | null;
  review_action?: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);
  const cookie = request.headers.get("cookie") ?? "";

  const url = new URL(request.url);
  url.pathname = "/api/admin/attendance-suspicious";
  url.search = "?status=pending&limit=100";

  const data = await fetchJsonOrEmpty(url.toString(), cookie);
  const rows = Array.isArray(data.rows) ? (data.rows as AttendanceRow[]) : [];

  return { session, rows };
}

export default function AdminAttendancePage({ loaderData }: Route.ComponentProps) {
  const rows = loaderData.rows;

  return (
    <AdminShell title="Attendance" session={loaderData.session}>
      <section className="mb-4 rounded-xl border border-[#d8dee8] bg-white p-4 shadow-sm">
        <p className="text-sm text-[#5b6d85]">Pending flagged attendance scans</p>
        <p className="text-2xl font-bold text-[#1b2738]">{rows.length}</p>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Attendance Review Queue</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">EMP ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">TIME</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">SCORE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">FLAGS</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3">{row.employee_code || "-"}</td>
                  <td className="px-4 py-3">{row.scan_timestamp ? new Date(row.scan_timestamp).toLocaleString("th-TH") : "-"}</td>
                  <td className="px-4 py-3">{row.suspicion_score ?? 0}</td>
                  <td className="px-4 py-3 text-[#5b6d85]">{Array.isArray(row.suspicion_flags) && row.suspicion_flags.length > 0 ? row.suspicion_flags.join(", ") : "-"}</td>
                  <td className="px-4 py-3">{row.review_action || "-"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[#8a97ac]">No flagged attendance scans awaiting review</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
