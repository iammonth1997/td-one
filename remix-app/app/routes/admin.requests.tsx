import type { Route } from "./+types/admin.requests";
import { requireAdminSession } from "~/lib/require-admin-session.server";
import { fetchJsonOrEmpty } from "~/lib/safe-server-fetch.server";
import AdminShell from "~/components/admin-shell";
import { useState } from "react";

type RequestRow = {
  id: string;
  request_type?: string | null;
  status?: string | null;
  created_at?: string | null;
  emp_id?: string | null;
  emp_code?: string | null;
  leave_type?: string | null;
  ot_hours?: number | null;
  reason?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  correction_date?: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  leave: "Leave",
  ot: "OT",
  time_correction: "Time Correction",
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  cancelled: "bg-gray-100 text-gray-600",
};

function apiPathForType(type: string, id: string) {
  if (type === "leave") return `/api/leave-request/${id}`;
  if (type === "ot") return `/api/ot-request/${id}`;
  return `/api/time-correction-request/${id}`;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);
  const url = new URL(request.url);
  url.pathname = "/api/admin/requests";
  url.search = "?status=all&type=all&limit=100";
  const data = await fetchJsonOrEmpty(url.toString(), request.headers.get("cookie") ?? "");
  const rows: RequestRow[] = Array.isArray(data.rows) ? (data.rows as RequestRow[]) : [];
  return { session, rows };
}

export default function AdminRequestsPage({ loaderData }: Route.ComponentProps) {
  const { session, rows } = loaderData;
  const [activeType, setActiveType] = useState<"all" | "leave" | "ot" | "time_correction">("all");
  const [activeStatus, setActiveStatus] = useState<"all" | "pending" | "approved" | "rejected">("all");
  const [rejectId, setRejectId] = useState<{ id: string; type: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const filtered = rows.filter(r =>
    (activeType === "all" || r.request_type === activeType) &&
    (activeStatus === "all" || r.status === activeStatus)
  );

  async function doApprove(row: RequestRow) {
    if (!row.request_type) return;
    setBusy(row.id);
    try {
      const res = await fetch(apiPathForType(row.request_type, row.id), {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (res.ok) window.location.reload();
      else { const d = await res.json() as Record<string,unknown>; alert(String(d.error || "Approve failed")); }
    } catch { alert("Network error"); }
    finally { setBusy(null); }
  }

  async function doReject() {
    if (!rejectId) return;
    setBusy(rejectId.id);
    try {
      const res = await fetch(apiPathForType(rejectId.type, rejectId.id), {
        method: "PUT", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "reject", reason: rejectReason }),
      });
      if (res.ok) { setRejectId(null); setRejectReason(""); window.location.reload(); }
      else { const d = await res.json() as Record<string,unknown>; alert(String(d.error || "Reject failed")); }
    } catch { alert("Network error"); }
    finally { setBusy(null); }
  }

  const typeFilters = [
    { key: "all", label: "All Types" },
    { key: "leave", label: "Leave" },
    { key: "ot", label: "OT" },
    { key: "time_correction", label: "Time Correction" },
  ] as const;

  const statusFilters = [
    { key: "all", label: "All Status" },
    { key: "pending", label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "rejected", label: "Rejected" },
  ] as const;

  return (
    <AdminShell title="Requests" session={session}>
      {/* Filters */}
      <div className="mb-4 flex flex-wrap gap-2">
        {typeFilters.map(f => (
          <button key={f.key} onClick={() => setActiveType(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${activeType === f.key ? "bg-[#2563eb] text-white" : "bg-[#f0f4fa] text-[#5b6d85] hover:bg-[#e2eaf4]"}`}>
            {f.label}
          </button>
        ))}
        <span className="mx-1 text-[#d8dee8]">|</span>
        {statusFilters.map(f => (
          <button key={f.key} onClick={() => setActiveStatus(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${activeStatus === f.key ? "bg-[#2563eb] text-white" : "bg-[#f0f4fa] text-[#5b6d85] hover:bg-[#e2eaf4]"}`}>
            {f.label}
          </button>
        ))}
      </div>

      <section className="overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Requests ({filtered.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">EMP</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">TYPE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">DETAILS</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">STATUS</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">DATE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={`${row.request_type}-${row.id}`} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3 font-medium">{row.emp_code || row.emp_id || "-"}</td>
                  <td className="px-4 py-3">{TYPE_LABELS[row.request_type ?? ""] ?? (row.request_type || "-")}</td>
                  <td className="px-4 py-3 text-[#5b6d85]">
                    {row.request_type === "leave" && (row.leave_type || (row.start_date ? `${row.start_date} → ${row.end_date}` : "-"))}
                    {row.request_type === "ot" && (row.ot_hours ? `${row.ot_hours}h` : "-")}
                    {row.request_type === "time_correction" && (row.correction_date || "-")}
                    {!["leave", "ot", "time_correction"].includes(row.request_type ?? "") && (row.reason || "-")}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[row.status ?? ""] ?? "bg-gray-100 text-gray-600"}`}>
                      {row.status || "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#8a97ac]">{row.created_at ? new Date(row.created_at).toLocaleDateString("th-TH") : "-"}</td>
                  <td className="px-4 py-3">
                    {row.status === "pending" && (
                      <div className="flex gap-2">
                        <button onClick={() => doApprove(row)} disabled={busy === row.id}
                          className="rounded bg-green-600 px-2 py-1 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50">
                          {busy === row.id ? "…" : "Approve"}
                        </button>
                        <button onClick={() => { setRejectId({ id: row.id, type: row.request_type! }); setRejectReason(""); }}
                          className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700">
                          Reject
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-6 text-center text-[#8a97ac]">No requests found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="mb-3 text-base font-semibold text-[#1b2738]">Reject Request</h3>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3}
              className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="Rejection reason (optional)" />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setRejectId(null)} className="rounded-lg border border-[#d8dee8] px-4 py-2 text-sm text-[#5b6d85] hover:bg-[#f7f9fc]">Cancel</button>
              <button onClick={doReject} disabled={Boolean(busy)} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                {busy ? "Rejecting…" : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
