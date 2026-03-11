"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/app/hooks/useSession";

const ALLOWED = new Set(["admin", "super_admin", "hr_payroll", "hr-payroll", "hr payroll", "hrpayroll"]);

export default function WorkLocationsAdminPage() {
  const router = useRouter();
  const { session, loading, getAuthHeaders } = useSession();
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ name: "", latitude: "", longitude: "", radius_meters: "200", is_active: true });

  const role = String(session?.role || "").trim().toLowerCase();
  const allowed = ALLOWED.has(role);

  async function loadRows() {
    const res = await fetch("/api/work-locations?all=1", { headers: getAuthHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "LOAD_FAILED");
    setRows(data.rows || []);
  }

  useEffect(() => {
    if (loading) return;
    if (!allowed) {
      router.replace("/dashboard");
      return;
    }
    loadRows().catch((e) => setError(String(e.message || e)));
  }, [loading, allowed, router]);

  async function createLocation(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/work-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          name: form.name,
          latitude: Number(form.latitude),
          longitude: Number(form.longitude),
          radius_meters: Number(form.radius_meters),
          is_active: Boolean(form.is_active),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "CREATE_FAILED");
      setForm({ name: "", latitude: "", longitude: "", radius_meters: "200", is_active: true });
      await loadRows();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(row) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/work-locations", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ id: row.id, is_active: !row.is_active }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "UPDATE_FAILED");
      await loadRows();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  async function removeLocation(row) {
    if (!confirm(`Delete location: ${row.name}?`)) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/work-locations?id=${encodeURIComponent(row.id)}`, {
        method: "DELETE",
        headers: { ...getAuthHeaders() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "DELETE_FAILED");
      await loadRows();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!allowed) return null;

  return (
    <main className="min-h-screen bg-[#F5F7FA] p-6 text-[#1A2B4A]">
      <div className="mx-auto max-w-6xl space-y-4">
        <h1 className="text-2xl font-bold">Manage Work Locations</h1>

        <form onSubmit={createLocation} className="rounded-xl border border-[#D0D8E4] bg-white p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
          <input className="border rounded px-3 py-2" placeholder="Name" value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
          <input className="border rounded px-3 py-2" placeholder="Latitude" value={form.latitude} onChange={(e) => setForm((s) => ({ ...s, latitude: e.target.value }))} />
          <input className="border rounded px-3 py-2" placeholder="Longitude" value={form.longitude} onChange={(e) => setForm((s) => ({ ...s, longitude: e.target.value }))} />
          <input className="border rounded px-3 py-2" placeholder="Radius meters" value={form.radius_meters} onChange={(e) => setForm((s) => ({ ...s, radius_meters: e.target.value }))} />
          <button disabled={busy} className="bg-[#1352A3] text-white rounded px-4 py-2 font-semibold">Add Location</button>
        </form>

        {error ? <p className="text-red-600 text-sm">{error}</p> : null}

        <div className="rounded-xl border border-[#D0D8E4] bg-white overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[#E8F0FB]">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Latitude</th>
                <th className="px-3 py-2 text-left">Longitude</th>
                <th className="px-3 py-2 text-left">Radius</th>
                <th className="px-3 py-2 text-left">Active</th>
                <th className="px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2">{row.latitude}</td>
                  <td className="px-3 py-2">{row.longitude}</td>
                  <td className="px-3 py-2">{row.radius_meters}</td>
                  <td className="px-3 py-2">{row.is_active ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 space-x-2">
                    <button onClick={() => toggleActive(row)} className="px-2 py-1 rounded border">{row.is_active ? "Disable" : "Enable"}</button>
                    <button onClick={() => removeLocation(row)} className="px-2 py-1 rounded border border-red-300 text-red-600">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
