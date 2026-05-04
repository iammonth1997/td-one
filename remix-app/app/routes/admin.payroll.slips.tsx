import type { Route } from "./+types/admin.payroll.slips";
import { requireAdminSession } from "~/lib/require-admin-session.server";
import AdminShell from "~/components/admin-shell";
import { formatBangkokDateTime } from "~/lib/date-time";

type SlipRow = {
  id: string;
  slip_type?: "salary" | "ot";
  emp_id?: string | null;
  amount?: number | null;
  created_at?: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);

  const salaryUrl = new URL(request.url);
  salaryUrl.pathname = "/api/salary-slip";
  salaryUrl.search = "?limit=20";

  const otUrl = new URL(request.url);
  otUrl.pathname = "/api/ot-slip";
  otUrl.search = "?limit=20";

  const [salaryRes, otRes] = await Promise.all([
    fetch(salaryUrl.toString(), { headers: { cookie: request.headers.get("cookie") ?? "" } }),
    fetch(otUrl.toString(), { headers: { cookie: request.headers.get("cookie") ?? "" } }),
  ]);

  const [salaryData, otData] = (await Promise.all([
    salaryRes.json().catch(() => ({})),
    otRes.json().catch(() => ({})),
  ])) as [Record<string, unknown>, Record<string, unknown>];

  const salaryList = Array.isArray(salaryData.slips)
    ? (salaryData.slips as SlipRow[])
    : Array.isArray(salaryData.rows)
      ? (salaryData.rows as SlipRow[])
      : [];
  const otList = Array.isArray(otData.slips)
    ? (otData.slips as SlipRow[])
    : Array.isArray(otData.rows)
      ? (otData.rows as SlipRow[])
      : [];

  const rows = [...salaryList.map((row) => ({ ...row, slip_type: "salary" as const })), ...otList.map((row) => ({ ...row, slip_type: "ot" as const }))]
    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
    .slice(0, 30);

  return { session, rows };
}

export default function AdminPayrollSlipsPage({ loaderData }: Route.ComponentProps) {
  const rows = loaderData.rows;

  return (
    <AdminShell title="Payroll Slips" session={loaderData.session}>
      <section className="overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Latest Slips</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">TYPE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">EMP ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">AMOUNT</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">CREATED</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={`${row.slip_type}-${row.id}`} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3">{row.slip_type === "salary" ? "Salary" : "OT"}</td>
                  <td className="px-4 py-3">{row.emp_id || "-"}</td>
                  <td className="px-4 py-3">{Number(row.amount ?? 0).toLocaleString("th-TH")} ₭</td>
                  <td className="px-4 py-3">{formatBangkokDateTime(row.created_at)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[#8a97ac]">No slips data</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
