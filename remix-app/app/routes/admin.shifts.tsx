import type { Route } from "./+types/admin.shifts";
import AdminShell from "~/components/admin-shell";
import { requireAdminSession } from "~/lib/require-admin-session.server";
import { useState } from "react";

type ShiftPattern = {
  id: string;
  pattern_name?: string | null;
  work_days?: number | null;
  rest_days?: number | null;
};

type ShiftType = {
  id: string;
  type_name?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireAdminSession(request, context);

  const url = new URL(request.url);
  url.pathname = "/api/admin/shifts";
  url.search = "?view=patterns";

  const res = await fetch(url.toString(), {
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });

  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const patterns = Array.isArray(data.patterns) ? (data.patterns as ShiftPattern[]) : [];
  const types = Array.isArray(data.types) ? (data.types as ShiftType[]) : [];

  return { session, patterns, types };
}

export default function AdminShiftsPage({ loaderData }: Route.ComponentProps) {
  const { patterns, types } = loaderData;
  const [showPattern, setShowPattern] = useState(false);
  const [showType, setShowType] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [patternForm, setPatternForm] = useState({ pattern_name: "", work_days: "5", rest_days: "2", cycle_days: "" });
  const [typeForm, setTypeForm] = useState({ type_name: "", start_time: "08:00", end_time: "17:00", break_minutes: "60" });

  async function savePattern() {
    if (!patternForm.pattern_name) { setError("Pattern name is required"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/admin/shifts", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create_pattern", pattern_name: patternForm.pattern_name, work_days: Number(patternForm.work_days), rest_days: Number(patternForm.rest_days), cycle_days: patternForm.cycle_days ? Number(patternForm.cycle_days) : undefined }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) { setError(String(data.error || "Save failed")); return; }
      setShowPattern(false);
      window.location.reload();
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  }

  async function saveType() {
    if (!typeForm.type_name) { setError("Type name is required"); return; }
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/admin/shifts", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "create_type", type_name: typeForm.type_name, start_time: typeForm.start_time, end_time: typeForm.end_time, break_minutes: typeForm.break_minutes ? Number(typeForm.break_minutes) : undefined }),
      });
      const data = await res.json() as Record<string, unknown>;
      if (!res.ok) { setError(String(data.error || "Save failed")); return; }
      setShowType(false);
      window.location.reload();
    } catch { setError("Network error"); }
    finally { setSaving(false); }
  }

  return (
    <AdminShell title="Shifts" session={loaderData.session}>
      {/* Shift Patterns */}
      <section className="mb-4 overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Shift Patterns ({patterns.length})</h2>
          <button onClick={() => { setPatternForm({ pattern_name: "", work_days: "5", rest_days: "2", cycle_days: "" }); setError(""); setShowPattern(true); }} className="rounded-lg bg-[#2563eb] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1d4ed8]">+ Add Pattern</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">PATTERN</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">WORK DAYS</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">REST DAYS</th>
              </tr>
            </thead>
            <tbody>
              {patterns.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3 font-medium">{row.pattern_name || "-"}</td>
                  <td className="px-4 py-3">{row.work_days ?? "-"}</td>
                  <td className="px-4 py-3">{row.rest_days ?? "-"}</td>
                </tr>
              ))}
              {patterns.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-[#8a97ac]">No shift patterns — click &quot;Add Pattern&quot; to start</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Shift Types */}
      <section className="overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Shift Types ({types.length})</h2>
          <button onClick={() => { setTypeForm({ type_name: "", start_time: "08:00", end_time: "17:00", break_minutes: "60" }); setError(""); setShowType(true); }} className="rounded-lg bg-[#2563eb] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1d4ed8]">+ Add Shift Type</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">TYPE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">START</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">END</th>
              </tr>
            </thead>
            <tbody>
              {types.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3 font-medium">{row.type_name || "-"}</td>
                  <td className="px-4 py-3">{row.start_time || "-"}</td>
                  <td className="px-4 py-3">{row.end_time || "-"}</td>
                </tr>
              ))}
              {types.length === 0 && <tr><td colSpan={3} className="px-4 py-6 text-center text-[#8a97ac]">No shift types — click &quot;Add Shift Type&quot; to start</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {/* Pattern Modal */}
      {showPattern && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-[#1b2738]">Add Shift Pattern</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Pattern Name *</label>
                <input value={patternForm.pattern_name} onChange={e => setPatternForm(f => ({ ...f, pattern_name: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="e.g. 5-2 Mon-Fri" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Work Days</label>
                  <input type="number" min="1" max="7" value={patternForm.work_days} onChange={e => setPatternForm(f => ({ ...f, work_days: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Rest Days</label>
                  <input type="number" min="0" max="6" value={patternForm.rest_days} onChange={e => setPatternForm(f => ({ ...f, rest_days: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Cycle Days</label>
                  <input type="number" min="1" value={patternForm.cycle_days} onChange={e => setPatternForm(f => ({ ...f, cycle_days: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="auto" />
                </div>
              </div>
            </div>
            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowPattern(false)} className="rounded-lg border border-[#d8dee8] px-4 py-2 text-sm text-[#5b6d85] hover:bg-[#f7f9fc]">Cancel</button>
              <button onClick={savePattern} disabled={saving} className="rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Shift Type Modal */}
      {showType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-[#1b2738]">Add Shift Type</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Type Name *</label>
                <input value={typeForm.type_name} onChange={e => setTypeForm(f => ({ ...f, type_name: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="e.g. Morning Shift" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Start Time</label>
                  <input type="time" value={typeForm.start_time} onChange={e => setTypeForm(f => ({ ...f, start_time: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-[#5b6d85]">End Time</label>
                  <input type="time" value={typeForm.end_time} onChange={e => setTypeForm(f => ({ ...f, end_time: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Break (minutes)</label>
                <input type="number" value={typeForm.break_minutes} onChange={e => setTypeForm(f => ({ ...f, break_minutes: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="60" />
              </div>
            </div>
            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setShowType(false)} className="rounded-lg border border-[#d8dee8] px-4 py-2 text-sm text-[#5b6d85] hover:bg-[#f7f9fc]">Cancel</button>
              <button onClick={saveType} disabled={saving} className="rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
