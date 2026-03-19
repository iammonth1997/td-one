import type { Route } from "./+types/admin.pay-policies";
import AdminShell from "~/components/admin-shell";
import { requireAdminSession } from "~/lib/require-admin-session.server";

type PolicyRow = {
  id: string;
  effective_from?: string | null;
  effective_to?: string | null;
  work_site?: { name?: string | null } | null;
  site_pay_rates?: Array<{ id: string }>;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);

  const url = new URL(request.url);
  url.pathname = "/api/admin/pay-policies";

  const res = await fetch(url.toString(), {
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const policies = Array.isArray(data.policies) ? (data.policies as PolicyRow[]) : [];

  return { session, policies };
}

export default function AdminPayPoliciesPage({ loaderData }: Route.ComponentProps) {
  return (
    <AdminShell title="Pay Policy" session={loaderData.session}>
      <section className="overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Site Pay Policies ({loaderData.policies.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">SITE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">EFFECTIVE FROM</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">EFFECTIVE TO</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">RATES</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.policies.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3">{row.work_site?.name || "-"}</td>
                  <td className="px-4 py-3">{row.effective_from || "-"}</td>
                  <td className="px-4 py-3">{row.effective_to || "-"}</td>
                  <td className="px-4 py-3">{row.site_pay_rates?.length ?? 0}</td>
                </tr>
              ))}
              {loaderData.policies.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[#8a97ac]">No pay policy data</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
