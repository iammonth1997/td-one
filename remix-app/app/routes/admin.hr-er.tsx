import { useState } from "react";
import AdminShell from "~/components/admin-shell";
import { requireAdminSession } from "~/lib/require-admin-session.server";

const CASE_TYPES = ["disciplinary", "grievance", "safety", "welfare", "investigation", "other"];
const CASE_STATUSES = ["open", "in_review", "resolved", "closed"];
const CASE_SEVERITIES = ["low", "medium", "high", "critical"];

type CaseRow = {
  id: string;
  employee_id?: string | null;
  case_type?: string | null;
  title?: string | null;
  detail?: string | null;
  severity?: string | null;
  status?: string | null;
  assigned_to?: string | null;
  occurred_on?: string | null;
  resolution_note?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type NoteRow = {
  id: string;
  visibility?: string | null;
  note?: string | null;
  created_by?: string | null;
  created_at?: string | null;
};

type CaseDetail = {
  row: CaseRow | null;
  notes: NoteRow[];
};

type LoaderData = {
  session: {
    emp_id: string;
    role: string | null;
  };
  rows: CaseRow[];
  stats: {
    totalCases: number;
    openCases: number;
    inReviewCases: number;
    criticalCases: number;
  };
};

function currentMonth() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function statusTone(status?: string | null) {
  switch (String(status || "").toLowerCase()) {
    case "open":
      return "bg-amber-100 text-amber-700";
    case "in_review":
      return "bg-sky-100 text-sky-700";
    case "resolved":
      return "bg-emerald-100 text-emerald-700";
    case "closed":
      return "bg-slate-200 text-slate-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function severityTone(severity?: string | null) {
  switch (String(severity || "").toLowerCase()) {
    case "critical":
      return "bg-rose-100 text-rose-700";
    case "high":
      return "bg-orange-100 text-orange-700";
    case "medium":
      return "bg-yellow-100 text-yellow-700";
    case "low":
      return "bg-emerald-100 text-emerald-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

async function readJson(res: Response) {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export async function loader({ request, context }: { request: Request; context: unknown }): Promise<LoaderData> {
  const session = await requireAdminSession(request, context);
  const cookie = request.headers.get("cookie") ?? "";

  const casesUrl = new URL(request.url);
  casesUrl.pathname = "/api/hr-er";
  casesUrl.search = "?limit=50";

  const res = await fetch(casesUrl.toString(), { headers: { cookie } });
  const data = (await res.json().catch(() => ({}))) as { rows?: CaseRow[] };
  const rows = Array.isArray(data.rows) ? data.rows : [];

  const stats = {
    totalCases: rows.length,
    openCases: rows.filter((row) => String(row.status || "").toLowerCase() === "open").length,
    inReviewCases: rows.filter((row) => String(row.status || "").toLowerCase() === "in_review").length,
    criticalCases: rows.filter((row) => String(row.severity || "").toLowerCase() === "critical").length,
  };

  return { session, rows: rows.slice(0, 30), stats };
}

export default function AdminHrErPage({ loaderData }: { loaderData: LoaderData }) {
  const { session, rows, stats } = loaderData;
  const [showCreate, setShowCreate] = useState(false);
  const [editingCase, setEditingCase] = useState<CaseRow | null>(null);
  const [statusCase, setStatusCase] = useState<CaseRow | null>(null);
  const [noteCase, setNoteCase] = useState<CaseRow | null>(null);
  const [deductionCase, setDeductionCase] = useState<CaseRow | null>(null);
  const [detailCase, setDetailCase] = useState<CaseRow | null>(null);
  const [caseDetail, setCaseDetail] = useState<CaseDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [createForm, setCreateForm] = useState({
    employee_code: "",
    case_type: "grievance",
    title: "",
    detail: "",
    severity: "medium",
    occurred_on: "",
    assigned_to: "",
  });
  const [editForm, setEditForm] = useState({
    title: "",
    detail: "",
    severity: "medium",
    occurred_on: "",
    assigned_to: "",
  });
  const [statusForm, setStatusForm] = useState({ status: "in_review", resolution_note: "" });
  const [noteForm, setNoteForm] = useState({ note: "", visibility: "internal" });
  const [deductionForm, setDeductionForm] = useState({ deduction_kind: "welfare", amount: "", start_month: currentMonth(), note: "" });

  function resetFeedback() {
    setError("");
    setSuccess("");
  }

  function closeAllModals() {
    setShowCreate(false);
    setEditingCase(null);
    setStatusCase(null);
    setNoteCase(null);
    setDeductionCase(null);
    setDetailCase(null);
    setCaseDetail(null);
    resetFeedback();
  }

  async function openDetail(row: CaseRow) {
    resetFeedback();
    setDetailCase(row);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/hr-er/${row.id}`);
      const data = await readJson(res);
      if (!res.ok) {
        setError(String(data.error || "Failed to load case detail"));
        setCaseDetail({ row, notes: [] });
        return;
      }
      setCaseDetail({
        row: (data.row as CaseRow | null) ?? row,
        notes: Array.isArray(data.notes) ? (data.notes as NoteRow[]) : [],
      });
    } catch {
      setError("Network error");
      setCaseDetail({ row, notes: [] });
    } finally {
      setDetailLoading(false);
    }
  }

  async function createCase() {
    if (!createForm.employee_code || !createForm.title) {
      setError("Employee code and title are required");
      return;
    }
    setSaving(true);
    resetFeedback();
    try {
      const res = await fetch("/api/hr-er", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create_case",
          employee_code: createForm.employee_code.trim().toUpperCase(),
          case_type: createForm.case_type,
          title: createForm.title.trim(),
          detail: createForm.detail.trim() || undefined,
          severity: createForm.severity,
          occurred_on: createForm.occurred_on || undefined,
          assigned_to: createForm.assigned_to.trim() || undefined,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(String(data.error || "Create case failed"));
        return;
      }
      setSuccess("Case created successfully");
      window.location.reload();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  function openEdit(row: CaseRow) {
    resetFeedback();
    setEditForm({
      title: row.title || "",
      detail: row.detail || "",
      severity: row.severity || "medium",
      occurred_on: row.occurred_on ? String(row.occurred_on).slice(0, 10) : "",
      assigned_to: row.assigned_to || "",
    });
    setEditingCase(row);
  }

  async function saveEdit() {
    if (!editingCase || !editForm.title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    resetFeedback();
    try {
      const res = await fetch(`/api/hr-er/${editingCase.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: editForm.title.trim(),
          detail: editForm.detail.trim(),
          severity: editForm.severity,
          occurred_on: editForm.occurred_on || null,
          assigned_to: editForm.assigned_to.trim() || null,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(String(data.error || "Update failed"));
        return;
      }
      setSuccess("Case updated successfully");
      window.location.reload();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  function openStatus(row: CaseRow) {
    resetFeedback();
    setStatusForm({ status: row.status || "in_review", resolution_note: row.resolution_note || "" });
    setStatusCase(row);
  }

  async function saveStatus() {
    if (!statusCase) return;
    setSaving(true);
    resetFeedback();
    try {
      const res = await fetch("/api/hr-er", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "set_status",
          case_id: statusCase.id,
          status: statusForm.status,
          resolution_note: statusForm.resolution_note.trim() || undefined,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(String(data.error || "Status update failed"));
        return;
      }
      setSuccess("Status updated successfully");
      window.location.reload();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  function openNote(row: CaseRow) {
    resetFeedback();
    setNoteForm({ note: "", visibility: "internal" });
    setNoteCase(row);
  }

  async function saveNote() {
    if (!noteCase || !noteForm.note.trim()) {
      setError("Note is required");
      return;
    }
    setSaving(true);
    resetFeedback();
    try {
      const res = await fetch("/api/hr-er", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "add_note",
          case_id: noteCase.id,
          note: noteForm.note.trim(),
          visibility: noteForm.visibility,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(String(data.error || "Add note failed"));
        return;
      }
      setSuccess("Note added successfully");
      window.location.reload();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  function openDeduction(row: CaseRow) {
    resetFeedback();
    setDeductionForm({ deduction_kind: "welfare", amount: "", start_month: currentMonth(), note: "" });
    setDeductionCase(row);
  }

  async function saveDeduction() {
    if (!deductionCase || !deductionForm.amount) {
      setError("Amount is required");
      return;
    }
    setSaving(true);
    resetFeedback();
    try {
      const res = await fetch("/api/hr-er", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "apply_deduction",
          case_id: deductionCase.id,
          deduction_kind: deductionForm.deduction_kind,
          amount: Number(deductionForm.amount),
          start_month: deductionForm.start_month,
          note: deductionForm.note.trim() || undefined,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(String(data.error || "Apply deduction failed"));
        return;
      }
      setSuccess("Deduction created successfully");
      window.location.reload();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell title="HR-ER" session={session}>
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-[#d8dee8] bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-[#7c8ba1]">TOTAL CASES</p>
          <p className="mt-1 text-3xl font-bold text-[#1b2738]">{stats.totalCases}</p>
        </article>
        <article className="rounded-xl border border-[#d8dee8] bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-[#7c8ba1]">OPEN</p>
          <p className="mt-1 text-3xl font-bold text-[#1b2738]">{stats.openCases}</p>
        </article>
        <article className="rounded-xl border border-[#d8dee8] bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-[#7c8ba1]">IN REVIEW</p>
          <p className="mt-1 text-3xl font-bold text-[#1b2738]">{stats.inReviewCases}</p>
        </article>
        <article className="rounded-xl border border-[#d8dee8] bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-[#7c8ba1]">CRITICAL</p>
          <p className="mt-1 text-3xl font-bold text-[#1b2738]">{stats.criticalCases}</p>
        </article>
      </section>

      <section className="mt-4 overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#e6ebf2] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-[#1b2738]">Case Management</h2>
            <p className="mt-1 text-xs text-[#7c8ba1]">Create cases, add notes, update status, and apply welfare or safety deductions.</p>
          </div>
          <button onClick={() => { resetFeedback(); setShowCreate(true); }} className="rounded-lg bg-[#2563eb] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1d4ed8]">+ Open Case</button>
        </div>
        {(error || success) && (
          <div className="border-b border-[#e6ebf2] px-4 py-3">
            {error ? <p className="text-xs text-red-600">{error}</p> : null}
            {!error && success ? <p className="text-xs text-emerald-600">{success}</p> : null}
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">TYPE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">TITLE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">SEVERITY</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">STATUS</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">ASSIGNED TO</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">DATE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7] align-top">
                  <td className="px-4 py-3 font-medium">{row.case_type || "-"}</td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-[#1b2738]">{row.title || "-"}</p>
                    <p className="mt-1 text-xs text-[#7c8ba1]">{row.id}</p>
                  </td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${severityTone(row.severity)}`}>{row.severity || "-"}</span></td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusTone(row.status)}`}>{row.status || "-"}</span></td>
                  <td className="px-4 py-3">{row.assigned_to || "-"}</td>
                  <td className="px-4 py-3">{row.created_at ? new Date(row.created_at).toLocaleDateString("th-TH") : "-"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => void openDetail(row)} className="text-xs font-medium text-[#2563eb] hover:underline">Detail</button>
                      <button onClick={() => openEdit(row)} className="text-xs font-medium text-[#2563eb] hover:underline">Edit</button>
                      <button onClick={() => openStatus(row)} className="text-xs font-medium text-[#2563eb] hover:underline">Status</button>
                      <button onClick={() => openNote(row)} className="text-xs font-medium text-[#2563eb] hover:underline">Add Note</button>
                      <button onClick={() => openDeduction(row)} className="text-xs font-medium text-[#2563eb] hover:underline">Deduction</button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#8a97ac]">No HR-ER cases yet. Use Open Case to start a new workflow.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-[#1b2738]">Open HR-ER Case</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Employee Code *</label>
                <input value={createForm.employee_code} onChange={e => setCreateForm(f => ({ ...f, employee_code: e.target.value.toUpperCase() }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="EMP001" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Case Type *</label>
                <select value={createForm.case_type} onChange={e => setCreateForm(f => ({ ...f, case_type: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm">
                  {CASE_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Title *</label>
                <input value={createForm.title} onChange={e => setCreateForm(f => ({ ...f, title: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="Describe the case briefly" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Severity</label>
                <select value={createForm.severity} onChange={e => setCreateForm(f => ({ ...f, severity: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm">
                  {CASE_SEVERITIES.map(level => <option key={level} value={level}>{level}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Assigned To</label>
                <input value={createForm.assigned_to} onChange={e => setCreateForm(f => ({ ...f, assigned_to: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="HR manager or owner" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Occurred On</label>
                <input type="date" value={createForm.occurred_on} onChange={e => setCreateForm(f => ({ ...f, occurred_on: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Detail</label>
                <textarea value={createForm.detail} onChange={e => setCreateForm(f => ({ ...f, detail: e.target.value }))} rows={4} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="Investigation notes, incident facts, or supporting detail" />
              </div>
            </div>
            {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={closeAllModals} className="rounded-lg border border-[#d8dee8] px-4 py-2 text-sm text-[#5b6d85] hover:bg-[#f7f9fc]">Cancel</button>
              <button onClick={createCase} disabled={saving} className="rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">{saving ? "Saving..." : "Create Case"}</button>
            </div>
          </div>
        </div>
      )}

      {editingCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-[#1b2738]">Edit Case</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Title *</label>
                <input value={editForm.title} onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Severity</label>
                <select value={editForm.severity} onChange={e => setEditForm(f => ({ ...f, severity: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm">
                  {CASE_SEVERITIES.map(level => <option key={level} value={level}>{level}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Assigned To</label>
                <input value={editForm.assigned_to} onChange={e => setEditForm(f => ({ ...f, assigned_to: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Occurred On</label>
                <input type="date" value={editForm.occurred_on} onChange={e => setEditForm(f => ({ ...f, occurred_on: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Detail</label>
                <textarea value={editForm.detail} onChange={e => setEditForm(f => ({ ...f, detail: e.target.value }))} rows={4} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
            </div>
            {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={closeAllModals} className="rounded-lg border border-[#d8dee8] px-4 py-2 text-sm text-[#5b6d85] hover:bg-[#f7f9fc]">Cancel</button>
              <button onClick={saveEdit} disabled={saving} className="rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">{saving ? "Saving..." : "Save Changes"}</button>
            </div>
          </div>
        </div>
      )}

      {statusCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-[#1b2738]">Update Case Status</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Status</label>
                <select value={statusForm.status} onChange={e => setStatusForm(f => ({ ...f, status: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm">
                  {CASE_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Resolution Note</label>
                <textarea value={statusForm.resolution_note} onChange={e => setStatusForm(f => ({ ...f, resolution_note: e.target.value }))} rows={4} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="Required when resolving or closing a case" />
              </div>
            </div>
            {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={closeAllModals} className="rounded-lg border border-[#d8dee8] px-4 py-2 text-sm text-[#5b6d85] hover:bg-[#f7f9fc]">Cancel</button>
              <button onClick={saveStatus} disabled={saving} className="rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">{saving ? "Saving..." : "Update Status"}</button>
            </div>
          </div>
        </div>
      )}

      {noteCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-[#1b2738]">Add Case Note</h3>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Visibility</label>
                <select value={noteForm.visibility} onChange={e => setNoteForm(f => ({ ...f, visibility: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm">
                  <option value="internal">Internal</option>
                  <option value="employee">Employee</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Note *</label>
                <textarea value={noteForm.note} onChange={e => setNoteForm(f => ({ ...f, note: e.target.value }))} rows={5} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="Write the latest follow-up or investigation note" />
              </div>
            </div>
            {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={closeAllModals} className="rounded-lg border border-[#d8dee8] px-4 py-2 text-sm text-[#5b6d85] hover:bg-[#f7f9fc]">Cancel</button>
              <button onClick={saveNote} disabled={saving} className="rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">{saving ? "Saving..." : "Add Note"}</button>
            </div>
          </div>
        </div>
      )}

      {deductionCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-[#1b2738]">Apply Deduction</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Deduction Kind</label>
                <select value={deductionForm.deduction_kind} onChange={e => setDeductionForm(f => ({ ...f, deduction_kind: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm">
                  <option value="welfare">Welfare</option>
                  <option value="safety">Safety</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Amount *</label>
                <input type="number" min="1" value={deductionForm.amount} onChange={e => setDeductionForm(f => ({ ...f, amount: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="150000" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Start Month</label>
                <input type="month" value={deductionForm.start_month} onChange={e => setDeductionForm(f => ({ ...f, start_month: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Note</label>
                <textarea value={deductionForm.note} onChange={e => setDeductionForm(f => ({ ...f, note: e.target.value }))} rows={4} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="Optional payroll note or explanation" />
              </div>
            </div>
            {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={closeAllModals} className="rounded-lg border border-[#d8dee8] px-4 py-2 text-sm text-[#5b6d85] hover:bg-[#f7f9fc]">Cancel</button>
              <button onClick={saveDeduction} disabled={saving} className="rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">{saving ? "Saving..." : "Apply Deduction"}</button>
            </div>
          </div>
        </div>
      )}

      {detailCase && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-[#1b2738]">Case Detail</h3>
                <p className="mt-1 text-xs text-[#7c8ba1]">{detailCase.id}</p>
              </div>
              <button onClick={closeAllModals} className="rounded-lg border border-[#d8dee8] px-3 py-1.5 text-xs text-[#5b6d85] hover:bg-[#f7f9fc]">Close</button>
            </div>
            {detailLoading ? (
              <p className="mt-4 text-sm text-[#7c8ba1]">Loading case detail...</p>
            ) : (
              <>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-[#e6ebf2] bg-[#f7f9fc] p-4">
                    <p className="text-xs font-semibold tracking-wide text-[#7c8ba1]">TITLE</p>
                    <p className="mt-1 text-sm font-medium text-[#1b2738]">{caseDetail?.row?.title || detailCase.title || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-[#e6ebf2] bg-[#f7f9fc] p-4">
                    <p className="text-xs font-semibold tracking-wide text-[#7c8ba1]">STATUS</p>
                    <p className="mt-1 text-sm font-medium text-[#1b2738]">{caseDetail?.row?.status || detailCase.status || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-[#e6ebf2] bg-[#f7f9fc] p-4 md:col-span-2">
                    <p className="text-xs font-semibold tracking-wide text-[#7c8ba1]">DETAIL</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[#1b2738]">{caseDetail?.row?.detail || detailCase.detail || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-[#e6ebf2] bg-[#f7f9fc] p-4 md:col-span-2">
                    <p className="text-xs font-semibold tracking-wide text-[#7c8ba1]">RESOLUTION NOTE</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[#1b2738]">{caseDetail?.row?.resolution_note || "-"}</p>
                  </div>
                </div>
                <div className="mt-5 overflow-hidden rounded-xl border border-[#d8dee8]">
                  <div className="border-b border-[#e6ebf2] px-4 py-3">
                    <h4 className="text-sm font-semibold text-[#1b2738]">Case Notes</h4>
                  </div>
                  <div className="max-h-[320px] overflow-y-auto">
                    {(caseDetail?.notes || []).map((note) => (
                      <div key={note.id} className="border-b border-[#edf1f7] px-4 py-3 last:border-b-0">
                        <div className="flex items-center justify-between gap-3">
                          <span className="rounded-full bg-[#eef4ff] px-2 py-1 text-[11px] font-semibold text-[#2563eb]">{note.visibility || "internal"}</span>
                          <span className="text-xs text-[#7c8ba1]">{note.created_at ? new Date(note.created_at).toLocaleString("th-TH") : "-"}</span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-sm text-[#1b2738]">{note.note || "-"}</p>
                        <p className="mt-1 text-xs text-[#7c8ba1]">By {note.created_by || "-"}</p>
                      </div>
                    ))}
                    {(caseDetail?.notes || []).length === 0 ? <p className="px-4 py-6 text-center text-sm text-[#8a97ac]">No notes recorded yet.</p> : null}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AdminShell>
  );
}
