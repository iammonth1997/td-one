import type { Route } from "./+types/admin.employees";
import { requireAdminSession } from "~/lib/require-admin-session.server";
import AdminShell from "~/components/admin-shell";

type EmployeeSetting = {
  id: string;
  emp_code: string;
  pay_type?: "monthly" | "daily";
  base_salary?: number | null;
  daily_rate?: number | null;
  work_site?: { name?: string | null } | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);

  const url = new URL(request.url);
  url.pathname = "/api/admin/employees/payroll-settings";

  const res = await fetch(url.toString(), {
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const rows = Array.isArray(data.settings) ? (data.settings as EmployeeSetting[]) : [];

  return { session, rows };
}

export default function AdminEmployeesPage({ loaderData }: Route.ComponentProps) {
  const rows = loaderData.rows;

  return (
    <AdminShell title="Employees" session={loaderData.session}>
      <section className="overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Employee Payroll Settings</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">EMP CODE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">PAY TYPE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">RATE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">WORK SITE</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3">{row.emp_code}</td>
                  <td className="px-4 py-3">{row.pay_type === "daily" ? "Daily" : "Monthly"}</td>
                  <td className="px-4 py-3">
                    {row.pay_type === "daily"
                      ? `${Number(row.daily_rate ?? 0).toLocaleString("th-TH")} ₭/day`
                      : `${Number(row.base_salary ?? 0).toLocaleString("th-TH")} ₭/month`}
                  </td>
                  <td className="px-4 py-3">{row.work_site?.name || "-"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[#8a97ac]">No employee data</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
