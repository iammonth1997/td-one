import type { Route } from "./+types/admin.requests";
import { requireAdminSession } from "~/lib/require-admin-session.server";
import AdminShell from "~/components/admin-shell";

type RequestRow = {
  id: string;
  request_type?: string | null;
  status?: string | null;
  created_at?: string | null;
  emp_id?: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);

  const url = new URL(request.url);
  url.pathname = "/api/request-history";

  const res = await fetch(url.toString(), {
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const rows = Array.isArray(data.requests)
    ? (data.requests as RequestRow[])
    : Array.isArray(data.rows)
      ? (data.rows as RequestRow[])
      : [];

  return { session, rows };
}

export default function AdminRequestsPage({ loaderData }: Route.ComponentProps) {
  const rows = loaderData.rows;

  return (
    <AdminShell title="Requests" session={loaderData.session}>
      <section className="overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Request History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">EMP ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">TYPE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">STATUS</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">DATE</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3">{row.emp_id || "-"}</td>
                  <td className="px-4 py-3">{row.request_type || "-"}</td>
                  <td className="px-4 py-3">{row.status || "-"}</td>
                  <td className="px-4 py-3">{row.created_at ? new Date(row.created_at).toLocaleString("th-TH") : "-"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[#8a97ac]">No request data</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
