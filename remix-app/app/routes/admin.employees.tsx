import type { Route } from "./+types/admin.employees";
import { requireAdminSession } from "~/lib/require-admin-session.server";
import AdminShell from "~/components/admin-shell";
import { useState } from "react";

type EmployeeSetting = {
  id: string;
  emp_code: string;
  pay_type?: "monthly" | "daily";
  base_salary?: number | null;
  daily_rate?: number | null;
  work_site?: { name?: string | null } | null;
};

type WorkLocation = { id: string; name?: string | null };

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);

  const cookie = request.headers.get("cookie") ?? "";
  const settingsUrl = new URL(request.url);
  settingsUrl.pathname = "/api/admin/employees/payroll-settings";

  const sitesUrl = new URL(request.url);
  sitesUrl.pathname = "/api/work-locations";

  const [settingsRes, sitesRes] = await Promise.all([
    fetch(settingsUrl.toString(), { headers: { cookie } }),
    fetch(sitesUrl.toString(), { headers: { cookie } }),
  ]);

  const settingsData = (await settingsRes.json().catch(() => ({}))) as Record<string, unknown>;
  const rows = Array.isArray(settingsData.settings) ? (settingsData.settings as EmployeeSetting[]) : [];

  const sitesData = (await sitesRes.json().catch(() => ({}))) as Record<string, unknown>;
  const sites: WorkLocation[] = Array.isArray(sitesData.rows)
    ? (sitesData.rows as WorkLocation[])
    : Array.isArray(sitesData.locations)
      ? (sitesData.locations as WorkLocation[])
      : [];

  return { session, rows, sites };
}

export default function AdminEmployeesPage({ loaderData }: Route.ComponentProps) {
  const { rows, sites } = loaderData;
  const [showModal, setShowModal] = useState(false);
  const [editRow, setEditRow] = useState<EmployeeSetting | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ emp_code: "", pay_type: "monthly", base_salary: "", daily_rate: "", work_site_id: "", bank_account_no: "", bank_name: "" });

  function openAdd() { setForm({ emp_code: "", pay_type: "monthly", base_salary: "", daily_rate: "", work_site_id: "", bank_account_no: "", bank_name: "" }); setEditRow(null); setError(""); setShowModal(true); }
  function openEdit(row: EmployeeSetting) {
    setForm({ emp_code: row.emp_code, pay_type: row.pay_type ?? "monthly", base_salary: String(row.base_salary ?? ""), daily_rate: String(row.daily_rate ?? ""), work_site_id: (row.work_site as { id?: string } | null)?.id ?? "", bank_account_no: "", bank_name: "" });
    setEditRow(row); setError(""); setShowModal(true);
  }

  async function handleSave() {
    setSaving(true); setError("");
    try {
      const body: Record<string, unknown> = { emp_code: form.emp_code, pay_type: form.pay_type };
      if (form.pay_type === "monthly") body.base_salary = Number(form.base_salary);
      else body.daily_rate = Number(form.daily_rate);
      if (form.work_site_id) body.work_site_id = form.work_site_id;
      if (form.bank_account_no) body.bank_account_no = form.bank_account_no;
      if (form.bank_name) body.bank_name = form.bank_name;

      const res = await fetch("/api/admin/employees/payroll-settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) { setError(String(data.error || "Save failed")); return; }
      setShowModal(false);
      window.location.reload();
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  }

  return (
    <AdminShell title="Employees" session={loaderData.session}>
      <section className="overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Employee Payroll Settings ({rows.length})</h2>
          <button onClick={openAdd} className="rounded-lg bg-[#2563eb] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1d4ed8]">+ Add Employee</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">EMP CODE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">PAY TYPE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">RATE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">WORK SITE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3 font-medium">{row.emp_code}</td>
                  <td className="px-4 py-3">{row.pay_type === "daily" ? "Daily" : "Monthly"}</td>
                  <td className="px-4 py-3">
                    {row.pay_type === "daily"
                      ? `${Number(row.daily_rate ?? 0).toLocaleString("th-TH")} ₭/day`
                      : `${Number(row.base_salary ?? 0).toLocaleString("th-TH")} ₭/month`}
                  </td>
                  <td className="px-4 py-3">{row.work_site?.name || "-"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(row)} className="text-xs text-[#2563eb] hover:underline">Edit</button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-[#8a97ac]">No employee data — click &quot;Add Employee&quot; to start</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-[#1b2738]">{editRow ? "Edit Employee" : "Add Employee"}</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Employee Code *</label>
                <input value={form.emp_code} onChange={e => setForm(f => ({ ...f, emp_code: e.target.value.toUpperCase() }))} disabled={Boolean(editRow)} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm disabled:bg-[#f7f9fc]" placeholder="e.g. EMP001" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Pay Type *</label>
                <select value={form.pay_type} onChange={e => setForm(f => ({ ...f, pay_type: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm">
                  <option value="monthly">Monthly Salary</option>
                  <option value="daily">Daily Rate</option>
                </select>
              </div>
              {form.pay_type === "monthly" ? (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Base Salary (₭/month) *</label>
                  <input type="number" value={form.base_salary} onChange={e => setForm(f => ({ ...f, base_salary: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="e.g. 5000000" />
                </div>
              ) : (
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Daily Rate (₭/day) *</label>
                  <input type="number" value={form.daily_rate} onChange={e => setForm(f => ({ ...f, daily_rate: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="e.g. 200000" />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Work Site</label>
                <select value={form.work_site_id} onChange={e => setForm(f => ({ ...f, work_site_id: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm">
                  <option value="">— None —</option>
                  {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Bank Name</label>
                  <input value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="BCEL" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Account No.</label>
                  <input value={form.bank_account_no} onChange={e => setForm(f => ({ ...f, bank_account_no: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="010-xxx-xxxx" />
                </div>
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
