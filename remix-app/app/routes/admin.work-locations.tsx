import type { Route } from "./+types/admin.work-locations";
import AdminShell from "~/components/admin-shell";
import { requireAdminSession } from "~/lib/require-admin-session.server";

type WorkLocation = {
  id: string;
  name?: string | null;
  site_code?: string | null;
  site_type?: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);

  const url = new URL(request.url);
  url.pathname = "/api/work-locations";

  const res = await fetch(url.toString(), {
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const locations = Array.isArray(data.locations)
    ? (data.locations as WorkLocation[])
    : Array.isArray(data.data)
      ? (data.data as WorkLocation[])
      : [];

  return { session, locations };
}

export default function AdminWorkLocationsPage({ loaderData }: Route.ComponentProps) {
  return (
    <AdminShell title="Work Sites" session={loaderData.session}>
      <section className="overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Work Locations ({loaderData.locations.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">NAME</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">SITE CODE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">TYPE</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.locations.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3">{row.name || "-"}</td>
                  <td className="px-4 py-3">{row.site_code || "-"}</td>
                  <td className="px-4 py-3">{row.site_type || "-"}</td>
                </tr>
              ))}
              {loaderData.locations.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-[#8a97ac]">No work locations</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
