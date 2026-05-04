import type { Route } from "./+types/admin.audit";
import AdminShell from "~/components/admin-shell";
import { requireAdminSession } from "~/lib/require-admin-session.server";
import { formatBangkokDateTime } from "~/lib/date-time";

type AuditRow = {
  id?: string;
  event_type?: string | null;
  emp_id?: string | null;
  created_at?: string | null;
  action?: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);

  const url = new URL(request.url);
  url.pathname = "/api/login/admin/password-reset-audit";

  const res = await fetch(url.toString(), {
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const rows = Array.isArray(data.rows)
    ? (data.rows as AuditRow[])
    : Array.isArray(data.logs)
      ? (data.logs as AuditRow[])
      : Array.isArray(data.audits)
        ? (data.audits as AuditRow[])
        : [];

  return { session, rows };
}

export default function AdminAuditPage({ loaderData }: Route.ComponentProps) {
  return (
    <AdminShell title="Audit Logs" session={loaderData.session}>
      <section className="overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Password Reset / Admin Audit</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">EMP ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">EVENT</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">ACTION</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">DATE</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.rows.map((row, index) => (
                <tr key={row.id ?? `${row.emp_id ?? "unknown"}-${index}`} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3">{row.emp_id || "-"}</td>
                  <td className="px-4 py-3">{row.event_type || "-"}</td>
                  <td className="px-4 py-3">{row.action || "-"}</td>
                  <td className="px-4 py-3">{formatBangkokDateTime(row.created_at)}</td>
                </tr>
              ))}
              {loaderData.rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[#8a97ac]">No audit entries</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
