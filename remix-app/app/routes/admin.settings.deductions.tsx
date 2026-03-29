import type { Route } from "./+types/admin.settings.deductions";
import AdminShell from "~/components/admin-shell";
import { requireAdminSession } from "~/lib/require-admin-session.server";
import { fetchJsonOrEmpty } from "~/lib/safe-server-fetch.server";
import { useState } from "react";

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

  const data = await fetchJsonOrEmpty(url.toString(), request.headers.get("cookie") ?? "");
  const templates = Array.isArray(data.templates) ? (data.templates as DeductionTemplate[]) : [];
  const activeEmployeeDeductions = Number(data.active_employee_deductions ?? 0);

  return { session, templates, activeEmployeeDeductions };
}

export default function AdminDeductionsPage({ loaderData }: Route.ComponentProps) {
  const { templates, activeEmployeeDeductions } = loaderData;
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", name_th: "", deduction_type: "fixed", default_amount: "", default_percentage: "", applies_to_run_type: "salary", auto_apply: false });

  async function handleSave() {
    if (!form.name || !form.deduction_type) { setError("Name and type are required"); return; }
    setSaving(true); setError("");
    try {
      const body: Record<string, unknown> = { name: form.name, name_th: form.name_th || null, deduction_type: form.deduction_type, applies_to_run_type: form.applies_to_run_type || null, auto_apply: form.auto_apply };
      if (form.deduction_type === "percentage" && form.default_percentage) body.default_percentage = Number(form.default_percentage);
      else if (form.default_amount) body.default_amount = Number(form.default_amount);
      const res = await fetch("/api/admin/deductions", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) { setError(String(data.error || "Save failed")); return; }
      setShowModal(false);
      window.location.reload();
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  }

  return (
    <AdminShell title="Deductions" session={loaderData.session}>
      <section className="mb-4 rounded-xl border border-[#d8dee8] bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-[#1b2738]">Deductions Summary</h2>
        <p className="mt-2 text-sm text-[#6b7b92]">Active employee deductions: <strong>{activeEmployeeDeductions}</strong></p>
      </section>

      <section className="overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Deduction Templates ({templates.length})</h2>
          <button onClick={() => { setForm({ name: "", name_th: "", deduction_type: "fixed", default_amount: "", default_percentage: "", applies_to_run_type: "salary", auto_apply: false }); setError(""); setShowModal(true); }} className="rounded-lg bg-[#2563eb] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1d4ed8]">+ Add Template</button>
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
              {templates.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3 font-medium">{row.name_th || row.name || "-"}</td>
                  <td className="px-4 py-3">{row.deduction_type || "-"}</td>
                  <td className="px-4 py-3">{row.default_amount != null ? Number(row.default_amount).toLocaleString("th-TH") : "-"}</td>
                  <td className="px-4 py-3">{row.default_percentage != null ? `${row.default_percentage}%` : "-"}</td>
                  <td className="px-4 py-3">{row.applies_to_run_type || "-"}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${row.is_active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"}`}>{row.is_active ? "Active" : "Inactive"}</span>
                  </td>
                </tr>
              ))}
              {templates.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-[#8a97ac]">No templates — click &quot;Add Template&quot; to start</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-[#1b2738]">Add Deduction Template</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Name (EN) *</label>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="e.g. Social Security" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Name (TH)</label>
                  <input value={form.name_th} onChange={e => setForm(f => ({ ...f, name_th: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="ประกันสังคม" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Deduction Type *</label>
                <select value={form.deduction_type} onChange={e => setForm(f => ({ ...f, deduction_type: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm">
                  <option value="fixed">Fixed Amount</option>
                  <option value="percentage">Percentage</option>
                  <option value="welfare">Welfare</option>
                  <option value="safety">Safety</option>
                  <option value="tax">Tax</option>
                </select>
              </div>
              {form.deduction_type === "percentage" ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Default Percentage (%)</label>
                  <input type="number" step="0.01" value={form.default_percentage} onChange={e => setForm(f => ({ ...f, default_percentage: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="e.g. 5" />
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Default Amount (₭)</label>
                  <input type="number" value={form.default_amount} onChange={e => setForm(f => ({ ...f, default_amount: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="e.g. 500000" />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Applies to Run Type</label>
                <select value={form.applies_to_run_type} onChange={e => setForm(f => ({ ...f, applies_to_run_type: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm">
                  <option value="salary">Salary</option>
                  <option value="ot">OT</option>
                  <option value="both">Both</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-sm text-[#5b6d85]">
                <input type="checkbox" checked={form.auto_apply} onChange={e => setForm(f => ({ ...f, auto_apply: e.target.checked }))} className="rounded" />
                Auto-apply to all employees
              </label>
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
