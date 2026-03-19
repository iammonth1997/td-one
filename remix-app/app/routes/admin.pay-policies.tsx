import type { Route } from "./+types/admin.pay-policies";
import AdminShell from "~/components/admin-shell";
import { requireAdminSession } from "~/lib/require-admin-session.server";
import { useState } from "react";

type PolicyRow = {
  id: string;
  effective_from?: string | null;
  effective_to?: string | null;
  work_site?: { name?: string | null } | null;
  site_pay_rates?: Array<{ id: string }>;
  notes?: string | null;
};

type WorkSite = { id: string; name?: string | null };

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);
  const cookie = request.headers.get("cookie") ?? "";
  const baseUrl = new URL(request.url);

  const policiesUrl = new URL(baseUrl);
  policiesUrl.pathname = "/api/admin/pay-policies";
  policiesUrl.search = "";

  const sitesUrl = new URL(baseUrl);
  sitesUrl.pathname = "/api/work-locations";
  sitesUrl.search = "";

  const [policiesRes, sitesRes] = await Promise.all([
    fetch(policiesUrl.toString(), { headers: { cookie } }),
    fetch(sitesUrl.toString(), { headers: { cookie } }),
  ]);

  const policiesData = (await policiesRes.json().catch(() => ({}))) as Record<string, unknown>;
  const sitesData = (await sitesRes.json().catch(() => ({}))) as Record<string, unknown>;

  const policies: PolicyRow[] = Array.isArray(policiesData.policies) ? (policiesData.policies as PolicyRow[]) : [];
  const sites: WorkSite[] = Array.isArray(sitesData.rows)
    ? (sitesData.rows as WorkSite[])
    : Array.isArray(sitesData.locations) ? (sitesData.locations as WorkSite[]) : [];

  return { session, policies, sites };
}

export default function AdminPayPoliciesPage({ loaderData }: Route.ComponentProps) {
  const { policies, sites } = loaderData;
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ work_site_id: "", effective_from: "", effective_to: "", notes: "" });

  async function handleSave() {
    if (!form.work_site_id || !form.effective_from) { setError("Work site and effective from date are required"); return; }
    setSaving(true); setError("");
    try {
      const body: Record<string, unknown> = { action: "create_policy", work_site_id: form.work_site_id, effective_from: form.effective_from };
      if (form.effective_to) body.effective_to = form.effective_to;
      if (form.notes) body.notes = form.notes;
      const res = await fetch("/api/admin/pay-policies", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) { setError(String(data.error || "Save failed")); return; }
      setShowModal(false);
      window.location.reload();
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  }

  return (
    <AdminShell title="Pay Policy" session={loaderData.session}>
      <section className="overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Site Pay Policies ({policies.length})</h2>
          <button onClick={() => { setForm({ work_site_id: "", effective_from: "", effective_to: "", notes: "" }); setError(""); setShowModal(true); }} className="rounded-lg bg-[#2563eb] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1d4ed8]">+ Add Policy</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">SITE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">EFFECTIVE FROM</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">EFFECTIVE TO</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">RATES</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">NOTES</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3 font-medium">{row.work_site?.name || "-"}</td>
                  <td className="px-4 py-3">{row.effective_from || "-"}</td>
                  <td className="px-4 py-3">{row.effective_to || "—"}</td>
                  <td className="px-4 py-3">{row.site_pay_rates?.length ?? 0} rates</td>
                  <td className="px-4 py-3 text-[#8a97ac]">{row.notes || "-"}</td>
                </tr>
              ))}
              {policies.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-[#8a97ac]">No pay policies — click &quot;Add Policy&quot; to start</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-[#1b2738]">Add Pay Policy</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Work Site *</label>
                <select value={form.work_site_id} onChange={e => setForm(f => ({ ...f, work_site_id: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm">
                  <option value="">— Select site —</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                {sites.length === 0 && <p className="mt-1 text-xs text-amber-600">No work sites found — add a work site first</p>}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Effective From *</label>
                <input type="date" value={form.effective_from} onChange={e => setForm(f => ({ ...f, effective_from: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Effective To (leave blank if ongoing)</label>
                <input type="date" value={form.effective_to} onChange={e => setForm(f => ({ ...f, effective_to: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Notes</label>
                <input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="Optional notes" />
              </div>
            </div>
            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowModal(false)} className="rounded-lg border border-[#d8dee8] px-4 py-2 text-sm text-[#5b6d85] hover:bg-[#f7f9fc]">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
