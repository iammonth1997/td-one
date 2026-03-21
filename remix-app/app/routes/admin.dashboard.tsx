import type { Route } from "./+types/admin.dashboard";
import { requireAdminSession } from "~/lib/require-admin-session.server";
import AdminShell from "~/components/admin-shell";
import { useState } from "react";

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

type SuspiciousScanRow = {
  id: string;
  employee_code?: string | null;
  scan_timestamp?: string | null;
  suspicion_score?: number | null;
  suspicion_flags?: string[] | null;
  review_action?: string | null;
};

type SuspiciousScanResponse = {
  rows?: SuspiciousScanRow[];
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);

  const historyUrl = new URL(request.url);
  historyUrl.pathname = "/api/request-history";

  const attendanceUrl = new URL(request.url);
  attendanceUrl.pathname = "/api/attendance/today";

  const suspiciousUrl = new URL(request.url);
  suspiciousUrl.pathname = "/api/admin/attendance-suspicious";
  suspiciousUrl.search = "?status=pending&limit=50";

  const [historyRes, attendanceRes, suspiciousRes] = await Promise.all([
    fetch(historyUrl.toString(), { headers: { cookie: request.headers.get("cookie") ?? "" } }),
    fetch(attendanceUrl.toString(), { headers: { cookie: request.headers.get("cookie") ?? "" } }),
    fetch(suspiciousUrl.toString(), { headers: { cookie: request.headers.get("cookie") ?? "" } }),
  ]);

  const historyData = (await historyRes.json().catch(() => ({}))) as RequestHistoryResponse;
  const attendanceData = (await attendanceRes.json().catch(() => ({}))) as AttendanceTodayResponse;
  const suspiciousData = (await suspiciousRes.json().catch(() => ({}))) as SuspiciousScanResponse;

  const activityRows: ActivityRow[] = historyData.rows ?? historyData.data ?? [];
  const attendanceRows = attendanceData.records ?? attendanceData.rows ?? [];
  const pendingFlaggedScans = suspiciousData.rows ?? [];
  const checkedInCount = attendanceRows.filter((r) => Boolean(r.check_in_time)).length;
  const pendingCount = activityRows.filter((r) => String(r.status || "").toLowerCase() === "pending").length;

  const cards: StatCard[] = [
    { label: "CHECKED IN", value: checkedInCount },
    { label: "PENDING REQUESTS", value: pendingCount },
    { label: "ALERTS", value: pendingFlaggedScans.length },
    { label: "EMPLOYEES", value: 0 },
  ];

  return {
    session,
    cards,
    activities: activityRows.slice(0, 8),
    flaggedScans: pendingFlaggedScans,
  };
}

export default function AdminDashboardPage({ loaderData }: Route.ComponentProps) {
  const cards = loaderData.cards;
  const activities = loaderData.activities;
  const flaggedScans = loaderData.flaggedScans;
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reviewScan(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      const res = await fetch(`/api/admin/attendance-suspicious/${id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
        alert(String(data.error || "Failed to update scan review"));
        return;
      }

      window.location.reload();
    } catch {
      alert("Network error");
    } finally {
      setBusyId(null);
    }
  }

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
          <h2 className="text-sm font-semibold text-[#1b2738]">Flagged Attendance Scans</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">EMPLOYEE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">TIME</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">SCORE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">FLAGS</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {flaggedScans.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3 font-medium">{row.employee_code || "-"}</td>
                  <td className="px-4 py-3">{row.scan_timestamp ? new Date(row.scan_timestamp).toLocaleString("th-TH") : "-"}</td>
                  <td className="px-4 py-3">{row.suspicion_score ?? 0}</td>
                  <td className="px-4 py-3 text-[#5b6d85]">{Array.isArray(row.suspicion_flags) && row.suspicion_flags.length > 0 ? row.suspicion_flags.join(", ") : "-"}</td>
                  <td className="px-4 py-3">
                    {row.review_action === "pending" ? (
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => reviewScan(row.id, "approve")}
                          disabled={busyId === row.id}
                          className="rounded bg-green-600 px-2 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                        >
                          {busyId === row.id ? "…" : "Approve"}
                        </button>
                        <button
                          type="button"
                          onClick={() => reviewScan(row.id, "reject")}
                          disabled={busyId === row.id}
                          className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          {busyId === row.id ? "…" : "Reject"}
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs text-[#8a97ac]">{row.review_action || "-"}</span>
                    )}
                  </td>
                </tr>
              ))}
              {flaggedScans.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-[#8a97ac]">No flagged scans awaiting review</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
