import type { Route } from "./+types/admin.payroll.history";
import { requireAdminSession } from "~/lib/require-admin-session.server";
import { fetchJsonOrEmpty } from "~/lib/safe-server-fetch.server";
import AdminShell from "~/components/admin-shell";

type PayrollRun = {
  id: string;
  type?: string | null;
  period_label?: string | null;
  total_amount?: number | null;
  created_at?: string | null;
  status?: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);
  const cookie = request.headers.get("cookie") ?? "";

  const salaryUrl = new URL(request.url);
  salaryUrl.pathname = "/api/payroll/runs";
  salaryUrl.search = "?run_type=salary";

  const otUrl = new URL(request.url);
  otUrl.pathname = "/api/payroll/runs";
  otUrl.search = "?run_type=ot_incentive";

  const [salaryData, otData] = await Promise.all([
    fetchJsonOrEmpty(salaryUrl.toString(), cookie),
    fetchJsonOrEmpty(otUrl.toString(), cookie),
  ]);

  const salaryRuns = Array.isArray(salaryData.runs)
    ? (salaryData.runs as Array<Record<string, unknown>>)
    : Array.isArray(salaryData.rows)
      ? (salaryData.rows as Array<Record<string, unknown>>)
      : [];
  const otRuns = Array.isArray(otData.runs)
    ? (otData.runs as Array<Record<string, unknown>>)
    : Array.isArray(otData.rows)
      ? (otData.rows as Array<Record<string, unknown>>)
      : [];

  const salaryList: PayrollRun[] = salaryRuns.map((row) => ({
    id: String(row.id ?? ""),
    type: "salary",
    period_label: String(row.period_label ?? row.period_month ?? "-"),
    total_amount: Number(row.total_amount ?? row.total_net ?? row.total_gross ?? 0),
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    status: typeof row.status === "string" ? row.status : null,
  })).filter((row) => row.id);
  const otList: PayrollRun[] = otRuns.map((row) => ({
    id: String(row.id ?? ""),
    type: "ot_incentive",
    period_label: String(row.period_label ?? row.period_month ?? "-"),
    total_amount: Number(row.total_amount ?? row.total_net ?? row.total_gross ?? 0),
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    status: typeof row.status === "string" ? row.status : null,
  })).filter((row) => row.id);

  const rows = [...salaryList, ...otList]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

  return { session, rows };
}

export default function AdminPayrollHistoryPage({ loaderData }: Route.ComponentProps) {
  const rows = loaderData.rows;

  return (
    <AdminShell title="Payroll History" session={loaderData.session}>
      <section className="overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Payroll History</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">TYPE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">PERIOD</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">TOTAL</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">STATUS</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">CREATED</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.type}-${row.id}`} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3">{row.type === "salary" ? "Salary" : "OT"}</td>
                  <td className="px-4 py-3">{row.period_label || "-"}</td>
                  <td className="px-4 py-3">{Number(row.total_amount ?? 0).toLocaleString("th-TH")} ₭</td>
                  <td className="px-4 py-3">{row.status || "-"}</td>
                  <td className="px-4 py-3">{row.created_at ? new Date(row.created_at).toLocaleString("th-TH") : "-"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[#8a97ac]">No payroll history</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
