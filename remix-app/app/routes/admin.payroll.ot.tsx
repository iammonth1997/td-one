import type { Route } from "./+types/admin.payroll.ot";
import { requireAdminSession } from "~/lib/require-admin-session.server";
import { fetchJsonOrEmpty } from "~/lib/safe-server-fetch.server";
import AdminShell from "~/components/admin-shell";
import { useState } from "react";

type PayrollRun = {
  id: string;
  period_label?: string | null;
  total_amount?: number | null;
  created_at?: string | null;
  status?: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);
  const cookie = request.headers.get("cookie") ?? "";

  const url = new URL(request.url);
  url.pathname = "/api/payroll/runs";
  url.search = "?run_type=ot_incentive";

  const data = await fetchJsonOrEmpty(url.toString(), cookie);
  const runs = Array.isArray(data.runs)
    ? (data.runs as Array<Record<string, unknown>>)
    : Array.isArray(data.rows)
      ? (data.rows as Array<Record<string, unknown>>)
      : [];

  const rows: PayrollRun[] = runs.map((row) => ({
    id: String(row.id ?? ""),
    period_label: String(row.period_label ?? row.period_month ?? "-"),
    total_amount: Number(row.total_amount ?? row.total_net ?? row.total_gross ?? 0),
    created_at: typeof row.created_at === "string" ? row.created_at : null,
    status: typeof row.status === "string" ? row.status : null,
  })).filter((row) => row.id);

  return { session, rows };
}

export default function AdminPayrollOtPage({ loaderData }: Route.ComponentProps) {
  const { rows } = loaderData;
  const [showModal, setShowModal] = useState(false);
  const [period, setPeriod] = useState(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`; });
  const [payDate, setPayDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleCreate() {
    if (!period) { setError("Period is required"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/payroll/runs", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ run_type: "ot_incentive", period_month: period, pay_date: payDate || null }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) { setError(String(data.error || "Failed to create run")); return; }
      setShowModal(false);
      window.location.reload();
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  }

  return (
    <AdminShell title="Payroll OT" session={loaderData.session}>
      <section className="overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">OT Runs ({rows.length})</h2>
          <button onClick={() => { setError(""); setShowModal(true); }} className="rounded-lg bg-[#2563eb] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1d4ed8]">▶ New OT Run</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">PERIOD</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">TOTAL</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">STATUS</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">CREATED</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3 font-medium">{row.period_label || "-"}</td>
                  <td className="px-4 py-3">{Number(row.total_amount ?? 0).toLocaleString("th-TH")} ₭</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${row.status === "completed" ? "bg-green-100 text-green-800" : row.status === "draft" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-600"}`}>
                      {row.status || "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#8a97ac]">{row.created_at ? new Date(row.created_at).toLocaleDateString("th-TH") : "-"}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-[#8a97ac]">No OT runs — click &quot;New OT Run&quot; to start</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-[#1b2738]">New OT Run</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Period Month (YYYY-MM) *</label>
                <input type="month" value={period} onChange={e => setPeriod(e.target.value)} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Pay Date</label>
                <input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
            </div>
            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="rounded-lg border border-[#d8dee8] px-4 py-2 text-sm text-[#5b6d85] hover:bg-[#f7f9fc]">Cancel</button>
              <button onClick={handleCreate} disabled={saving} className="rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">{saving ? "Creating…" : "Create Run"}</button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
