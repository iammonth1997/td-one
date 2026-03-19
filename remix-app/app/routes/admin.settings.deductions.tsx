import type { Route } from "./+types/admin.settings.deductions";
import AdminShell from "~/components/admin-shell";
import { requireAdminSession } from "~/lib/require-admin-session.server";

type DeductionTemplate = {
  id: string;
  name?: string | null;
  name_th?: string | null;
  deduction_type?: string | null;
  default_amount?: number | null;
  default_percentage?: number | null;
  applies_to_run_type?: string | null;
  auto_apply?: boolean;
  is_active?: boolean;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);

  const url = new URL(request.url);
  url.pathname = "/api/admin/deductions";
  url.search = "";

  const res = await fetch(url.toString(), {
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const templates = Array.isArray(data.templates) ? (data.templates as DeductionTemplate[]) : [];
  const activeEmployeeDeductions = Number(data.active_employee_deductions ?? 0);

  return { session, templates, activeEmployeeDeductions };
}

export default function AdminDeductionsPage({ loaderData }: Route.ComponentProps) {
  return (
    <AdminShell title="Deductions" session={loaderData.session}>
      <section className="mb-4 rounded-xl border border-[#d8dee8] bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-[#1b2738]">Deductions Summary</h2>
        <p className="mt-2 text-sm text-[#6b7b92]">Active employee deductions: {loaderData.activeEmployeeDeductions}</p>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Deduction Templates ({loaderData.templates.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">NAME</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">TYPE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">DEFAULT AMOUNT</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">DEFAULT %</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">APPLIES TO</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {loaderData.templates.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3">{row.name_th || row.name || "-"}</td>
                  <td className="px-4 py-3">{row.deduction_type || "-"}</td>
                  <td className="px-4 py-3">{row.default_amount ?? "-"}</td>
                  <td className="px-4 py-3">{row.default_percentage ?? "-"}</td>
                  <td className="px-4 py-3">{row.applies_to_run_type || "-"}</td>
                  <td className="px-4 py-3">{row.is_active ? "Active" : "Inactive"}</td>
                </tr>
              ))}
              {loaderData.templates.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[#8a97ac]">No deduction template data</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
