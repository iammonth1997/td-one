import type { Route } from "./+types/admin.shifts";
import AdminShell from "~/components/admin-shell";
import { requireAdminSession } from "~/lib/require-admin-session.server";

type ShiftPattern = {
  id: string;
  pattern_name?: string | null;
  work_days?: number | null;
  rest_days?: number | null;
};

type ShiftType = {
  id: string;
  type_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);

  const url = new URL(request.url);
  url.pathname = "/api/admin/shifts";
  url.search = "?view=patterns";

  const res = await fetch(url.toString(), {
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const patterns = Array.isArray(data.patterns) ? (data.patterns as ShiftPattern[]) : [];
  const types = Array.isArray(data.types) ? (data.types as ShiftType[]) : [];

  return { session, patterns, types };
}

export default function AdminShiftsPage({ loaderData }: Route.ComponentProps) {
  return (
    <AdminShell title="Shifts" session={loaderData.session}>
      <section className="mb-4 overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Shift Patterns ({loaderData.patterns.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">PATTERN</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">WORK DAYS</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">REST DAYS</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.patterns.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3">{row.pattern_name || "-"}</td>
                  <td className="px-4 py-3">{row.work_days ?? "-"}</td>
                  <td className="px-4 py-3">{row.rest_days ?? "-"}</td>
                </tr>
              ))}
              {loaderData.patterns.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-[#8a97ac]">No shift pattern data</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Shift Types ({loaderData.types.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">TYPE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">START</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">END</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.types.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3">{row.type_name || "-"}</td>
                  <td className="px-4 py-3">{row.start_time || "-"}</td>
                  <td className="px-4 py-3">{row.end_time || "-"}</td>
                </tr>
              ))}
              {loaderData.types.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-[#8a97ac]">No shift type data</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
