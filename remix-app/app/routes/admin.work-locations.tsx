import type { Route } from "./+types/admin.work-locations";
import AdminShell from "~/components/admin-shell";
import { requireAdminSession } from "~/lib/require-admin-session.server";
import { useState } from "react";

type WorkLocation = {
  id: string;
  name?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  radius_meters?: number | null;
  boundary_type?: string | null;
  is_active?: boolean | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);
  const url = new URL(request.url);
  url.pathname = "/api/work-locations";
  const res = await fetch(url.toString(), { headers: { cookie: request.headers.get("cookie") ?? "" } });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const locations: WorkLocation[] = Array.isArray(data.rows)
    ? (data.rows as WorkLocation[])
    : Array.isArray(data.locations)
      ? (data.locations as WorkLocation[])
      : [];
  return { session, locations };
}

export default function AdminWorkLocationsPage({ loaderData }: Route.ComponentProps) {
  const { locations } = loaderData;
  const [showModal, setShowModal] = useState(false);
  const [editRow, setEditRow] = useState<WorkLocation | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", latitude: "", longitude: "", radius_meters: "200", boundary_type: "circle" });

  function openAdd() { setForm({ name: "", latitude: "", longitude: "", radius_meters: "200", boundary_type: "circle" }); setEditRow(null); setError(""); setShowModal(true); }
  function openEdit(row: WorkLocation) {
    setForm({ name: row.name ?? "", latitude: String(row.latitude ?? ""), longitude: String(row.longitude ?? ""), radius_meters: String(row.radius_meters ?? 200), boundary_type: row.boundary_type ?? "circle" });
    setEditRow(row); setError(""); setShowModal(true);
  }

  async function handleSave() {
    if (!form.name.trim() || !form.latitude || !form.longitude) { setError("Name, latitude and longitude are required"); return; }
    setSaving(true); setError("");
    try {
      const body: Record<string, unknown> = { name: form.name.trim(), latitude: Number(form.latitude), longitude: Number(form.longitude), radius_meters: Number(form.radius_meters || 200), boundary_type: "circle" };
      if (editRow) body.id = editRow.id;
      const url = "/api/work-locations";
      const method = editRow ? "PUT" : "POST";
      const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) { setError(String(data.error || data.detail || "Save failed")); return; }
      setShowModal(false);
      window.location.reload();
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  }

  return (
    <AdminShell title="Work Sites" session={loaderData.session}>
      <section className="overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Work Locations ({locations.length})</h2>
          <button onClick={openAdd} className="rounded-lg bg-[#2563eb] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1d4ed8]">+ Add Location</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">NAME</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">COORDINATES</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">RADIUS</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">TYPE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3 font-medium">{row.name || "-"}</td>
                  <td className="px-4 py-3 text-[#8a97ac]">{row.latitude != null ? `${row.latitude}, ${row.longitude}` : "-"}</td>
                  <td className="px-4 py-3">{row.radius_meters ? `${row.radius_meters}m` : "-"}</td>
                  <td className="px-4 py-3">{row.boundary_type || "circle"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => openEdit(row)} className="text-xs text-[#2563eb] hover:underline">Edit</button>
                  </td>
                </tr>
              ))}
              {locations.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-6 text-center text-[#8a97ac]">No work locations — click &quot;Add Location&quot; to start</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-[#1b2738]">{editRow ? "Edit Location" : "Add Work Location"}</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Location Name *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="e.g. Head Office" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Latitude *</label>
                  <input type="number" step="any" value={form.latitude} onChange={e => setForm(f => ({ ...f, latitude: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="e.g. 17.9757" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Longitude *</label>
                  <input type="number" step="any" value={form.longitude} onChange={e => setForm(f => ({ ...f, longitude: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="e.g. 102.6331" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Radius (meters)</label>
                  <input type="number" value={form.radius_meters} onChange={e => setForm(f => ({ ...f, radius_meters: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="200" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Boundary Type</label>
                  <select value={form.boundary_type} onChange={e => setForm(f => ({ ...f, boundary_type: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" disabled>
                    <option value="circle">Circle</option>
                  </select>
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
