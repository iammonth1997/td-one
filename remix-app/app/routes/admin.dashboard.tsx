import type { Route } from "./+types/admin.dashboard";
import { requireAdminSession } from "~/lib/require-admin-session.server";
import AdminShell from "~/components/admin-shell";

type ActivityRow = {
  id: string;
  actor_name?: string | null;
  action_type?: string | null;
  status?: string | null;
  created_at?: string | null;
};

type StatCard = {
  label: string;
  value: number;
};

type RequestHistoryResponse = {
  rows?: ActivityRow[];
  data?: ActivityRow[];
};

type AttendanceRecord = {
  check_in_time?: string | null;
};

type AttendanceTodayResponse = {
  records?: AttendanceRecord[];
  rows?: AttendanceRecord[];
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);

  const historyUrl = new URL(request.url);
  historyUrl.pathname = "/api/request-history";

  const attendanceUrl = new URL(request.url);
  attendanceUrl.pathname = "/api/attendance/today";

  const [historyRes, attendanceRes] = await Promise.all([
    fetch(historyUrl.toString(), { headers: { cookie: request.headers.get("cookie") ?? "" } }),
    fetch(attendanceUrl.toString(), { headers: { cookie: request.headers.get("cookie") ?? "" } }),
  ]);

  const historyData = (await historyRes.json().catch(() => ({}))) as RequestHistoryResponse;
  const attendanceData = (await attendanceRes.json().catch(() => ({}))) as AttendanceTodayResponse;

  const activityRows: ActivityRow[] = historyData.rows ?? historyData.data ?? [];
  const attendanceRows = attendanceData.records ?? attendanceData.rows ?? [];
  const checkedInCount = attendanceRows.filter((r) => Boolean(r.check_in_time)).length;
  const pendingCount = activityRows.filter((r) => String(r.status || "").toLowerCase() === "pending").length;

  const cards: StatCard[] = [
    { label: "CHECKED IN", value: checkedInCount },
    { label: "PENDING REQUESTS", value: pendingCount },
    { label: "ALERTS", value: 0 },
    { label: "EMPLOYEES", value: 0 },
  ];

  return { session, cards, activities: activityRows.slice(0, 8) };
}

export default function AdminDashboardPage({ loaderData }: Route.ComponentProps) {
  const cards = loaderData.cards;
  const activities = loaderData.activities;

  return (
    <AdminShell title="Dashboard" session={loaderData.session}>
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article key={card.label} className="rounded-xl border border-[#d8dee8] bg-white p-4 shadow-sm">
            <p className="text-[11px] font-semibold tracking-wide text-[#7c8ba1]">{card.label}</p>
            <p className="mt-1 text-3xl font-bold text-[#1b2738]">{card.value}</p>
          </article>
        ))}
      </section>

      <section className="mt-4 overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Recent Activity</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">NAME</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">ACTION</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">STATUS</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">DATE</th>
              </tr>
            </thead>
            <tbody>
              {activities.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3">{row.actor_name || "-"}</td>
                  <td className="px-4 py-3">{row.action_type || "-"}</td>
                  <td className="px-4 py-3">{row.status || "-"}</td>
                  <td className="px-4 py-3">{row.created_at ? new Date(row.created_at).toLocaleString("th-TH") : "-"}</td>
                </tr>
              ))}
              {activities.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[#8a97ac]">No recent activity</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
