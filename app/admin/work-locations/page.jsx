"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/app/hooks/useSession";
import LocationBoundaryMap from "@/app/admin/work-locations/LocationBoundaryMap";

const DEFAULT_FORM = {
  name: "",
  boundary_type: "circle",
  latitude: "",
  longitude: "",
  radius_meters: "200",
  boundary_json: null,
  is_active: true,
};

const ALLOWED = new Set(["admin", "super_admin", "hr_payroll", "hr-payroll", "hr payroll", "hrpayroll"]);

export default function WorkLocationsAdminPage() {
  const router = useRouter();
  const { session, loading, getAuthHeaders } = useSession({
    loginPath: "/admin/login",
    requiredPortal: "admin_portal",
  });
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mapResetTick, setMapResetTick] = useState(0);
  const [form, setForm] = useState(DEFAULT_FORM);

  const role = String(session?.role || "").trim().toLowerCase();
  const allowed = ALLOWED.has(role);

  const loadRows = useCallback(async () => {
    const res = await fetch("/api/work-locations?all=1", { headers: getAuthHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "LOAD_FAILED");
    setRows(data.rows || []);
  }, [getAuthHeaders]);

  useEffect(() => {
    if (loading) return;
    if (!allowed) {
      router.replace("/admin");
      return;
    }
    loadRows().catch((e) => setError(String(e.message || e)));
  }, [loading, allowed, loadRows, router]);

  async function createLocation(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if ((form.boundary_type === "rectangle" || form.boundary_type === "polygon") && !form.boundary_json) {
        throw new Error(`Please draw a ${form.boundary_type} on the map before saving.`);
      }

      const res = await fetch("/api/work-locations", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          name: form.name,
          boundary_type: form.boundary_type,
          latitude: form.latitude === "" ? undefined : Number(form.latitude),
          longitude: form.longitude === "" ? undefined : Number(form.longitude),
          radius_meters: Number(form.radius_meters),
          boundary_json: form.boundary_json,
          is_active: Boolean(form.is_active),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "CREATE_FAILED");
      setForm(DEFAULT_FORM);
      setMapResetTick((value) => value + 1);
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

  const isRectangle = form.boundary_type === "rectangle";
  const isPolygon = form.boundary_type === "polygon";
  const isShapeBoundary = isRectangle || isPolygon;

  function renderBoundarySummary(boundaryType, boundaryJson) {
    if (boundaryType === "rectangle" && boundaryJson) {
      return `${Number(boundaryJson.south).toFixed(4)}, ${Number(boundaryJson.west).toFixed(4)} -> ${Number(boundaryJson.north).toFixed(4)}, ${Number(boundaryJson.east).toFixed(4)}`;
    }

    if (boundaryType === "polygon" && boundaryJson?.points?.length) {
      return `${boundaryJson.points.length} points`;
    }

    return null;
  }

  return (
    <main className="min-h-screen bg-[#F5F7FA] p-6 text-[#1A2B4A]">
      <div className="mx-auto max-w-6xl space-y-4">
        <h1 className="text-2xl font-bold">Manage Work Locations</h1>

        <form onSubmit={createLocation} className="rounded-xl border border-[#D0D8E4] bg-white p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              className="border rounded px-3 py-2"
              placeholder="Name"
              value={form.name}
              onChange={(e) => setForm((state) => ({ ...state, name: e.target.value }))}
            />

            <select
              className="border rounded px-3 py-2 bg-white"
              value={form.boundary_type}
              onChange={(e) => {
                const nextBoundaryType = e.target.value;
                setForm((state) => ({
                  ...state,
                  boundary_type: nextBoundaryType,
                  boundary_json: null,
                  latitude: nextBoundaryType === "circle" ? state.latitude : "",
                  longitude: nextBoundaryType === "circle" ? state.longitude : "",
                }));
                setMapResetTick((value) => value + 1);
              }}
            >
              <option value="circle">Circle (center + radius)</option>
              <option value="rectangle">Rectangle (draw on map)</option>
              <option value="polygon">Polygon (free-form draw)</option>
            </select>
          </div>

          <LocationBoundaryMap
            boundaryType={form.boundary_type}
            latitude={Number(form.latitude)}
            longitude={Number(form.longitude)}
            radiusMeters={Number(form.radius_meters || 200)}
            boundaryJson={form.boundary_json}
            clearSignal={mapResetTick}
            onCircleChange={({ latitude, longitude }) => {
              setForm((state) => ({
                ...state,
                latitude: String(latitude),
                longitude: String(longitude),
              }));
            }}
            onRectangleChange={(boundary) => {
              const centerLat = ((boundary.south + boundary.north) / 2).toFixed(8);
              const centerLng = ((boundary.west + boundary.east) / 2).toFixed(8);
              setForm((state) => ({
                ...state,
                latitude: centerLat,
                longitude: centerLng,
                boundary_json: boundary,
              }));
            }}
            onPolygonChange={(boundary) => {
              const latitudes = boundary.points.map((point) => point.lat);
              const longitudes = boundary.points.map((point) => point.lng);
              const centerLat = ((Math.min(...latitudes) + Math.max(...latitudes)) / 2).toFixed(8);
              const centerLng = ((Math.min(...longitudes) + Math.max(...longitudes)) / 2).toFixed(8);
              setForm((state) => ({
                ...state,
                latitude: centerLat,
                longitude: centerLng,
                boundary_json: boundary,
              }));
            }}
          />

          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input
              className="border rounded px-3 py-2"
              placeholder="Latitude"
              value={form.latitude}
              onChange={(e) => setForm((state) => ({ ...state, latitude: e.target.value }))}
              disabled={isShapeBoundary}
            />
            <input
              className="border rounded px-3 py-2"
              placeholder="Longitude"
              value={form.longitude}
              onChange={(e) => setForm((state) => ({ ...state, longitude: e.target.value }))}
              disabled={isShapeBoundary}
            />
            <input
              className="border rounded px-3 py-2"
              placeholder="Radius meters"
              value={form.radius_meters}
              onChange={(e) => setForm((state) => ({ ...state, radius_meters: e.target.value }))}
              disabled={isShapeBoundary}
            />
            <button disabled={busy} className="bg-[#1352A3] text-white rounded px-4 py-2 font-semibold">Add Location</button>
          </div>

          {isShapeBoundary && (
            <div className="rounded-lg border border-[#D0D8E4] bg-[#F5F7FA] px-3 py-2 text-sm text-[#334260]">
              {isRectangle && form.boundary_json ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <span>South / West: {form.boundary_json.south.toFixed(6)}, {form.boundary_json.west.toFixed(6)}</span>
                  <span>North / East: {form.boundary_json.north.toFixed(6)}, {form.boundary_json.east.toFixed(6)}</span>
                </div>
              ) : isPolygon && form.boundary_json?.points?.length ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <span>Vertices: {form.boundary_json.points.length} points</span>
                  <span>Center: {form.latitude}, {form.longitude}</span>
                </div>
              ) : (
                <span>
                  {isRectangle
                    ? "Draw 2 opposite corners on the map to create a rectangular work area."
                    : "Click around the work area to add polygon points. At least 3 points are required."}
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-3 text-sm">
            <button
              type="button"
              className="rounded border border-[#D0D8E4] px-3 py-2 bg-white"
              onClick={() => {
                setForm(DEFAULT_FORM);
                setMapResetTick((value) => value + 1);
              }}
            >
              Reset Form
            </button>
            <span className="text-[#6B7A99]">Tip: circle is for a single building, rectangle for box-like areas, polygon for real site outlines.</span>
          </div>
        </form>

        {error ? <p className="text-red-600 text-sm">{error}</p> : null}

        <div className="rounded-xl border border-[#D0D8E4] bg-white overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[#E8F0FB]">
              <tr>
                <th className="px-3 py-2 text-left">Name</th>
                <th className="px-3 py-2 text-left">Type</th>
                <th className="px-3 py-2 text-left">Latitude</th>
                <th className="px-3 py-2 text-left">Longitude</th>
                <th className="px-3 py-2 text-left">Boundary</th>
                <th className="px-3 py-2 text-left">Active</th>
                <th className="px-3 py-2 text-left">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2">{row.name}</td>
                  <td className="px-3 py-2 capitalize">{row.boundary_type || "circle"}</td>
                  <td className="px-3 py-2">{row.latitude}</td>
                  <td className="px-3 py-2">{row.longitude}</td>
                  <td className="px-3 py-2 text-xs text-[#6B7A99]">
                    {renderBoundarySummary(row.boundary_type, row.boundary_json) || `${row.radius_meters} m`}
                  </td>
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
