import { useState } from "react";
import AdminShell from "~/components/admin-shell";
import { requireAdminSession } from "~/lib/require-admin-session.server";

const REQUISITION_STATUSES = ["draft", "open", "on_hold", "closed", "cancelled"];
const EMPLOYMENT_TYPES = ["full_time", "part_time", "contract", "internship"];
const CANDIDATE_STAGES = ["applied", "screening", "interview", "offer", "hired", "rejected", "withdrawn"];

type RequisitionRow = {
  id: string;
  job_code?: string | null;
  title?: string | null;
  department?: string | null;
  headcount?: number | null;
  employment_type?: string | null;
  status?: string | null;
  target_start_date?: string | null;
  description?: string | null;
  created_at?: string | null;
};

type CandidateRow = {
  id: string;
  requisition_id?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  source?: string | null;
  current_stage?: string | null;
  expected_salary?: number | null;
  notes?: string | null;
  created_at?: string | null;
};

type RequisitionDetail = {
  requisition: RequisitionRow | null;
  candidates: CandidateRow[];
};

type LoaderData = {
  session: {
    emp_id: string;
    role: string;
  };
  requisitions: RequisitionRow[];
  candidates: CandidateRow[];
  stats: {
    totalRequisitions: number;
    openRequisitions: number;
    totalCandidates: number;
    hiredCandidates: number;
  };
};

export async function loader({ request, context }: { request: Request; context: unknown }): Promise<LoaderData> {
  const session = await requireAdminSession(request, context);
  const cookie = request.headers.get("cookie") ?? "";

  const requisitionsUrl = new URL(request.url);
  requisitionsUrl.pathname = "/api/recruitment";
  requisitionsUrl.search = "?limit=50";

  const candidatesUrl = new URL(request.url);
  candidatesUrl.pathname = "/api/recruitment";
  candidatesUrl.search = "?view=candidates&limit=50";

  const [requisitionsRes, candidatesRes] = await Promise.all([
    fetch(requisitionsUrl.toString(), { headers: { cookie } }),
    fetch(candidatesUrl.toString(), { headers: { cookie } }),
  ]);

  const requisitionsData = (await requisitionsRes.json().catch(() => ({}))) as { rows?: RequisitionRow[] };
  const candidatesData = (await candidatesRes.json().catch(() => ({}))) as { rows?: CandidateRow[] };

  const requisitions = Array.isArray(requisitionsData.rows) ? requisitionsData.rows : [];
  const candidates = Array.isArray(candidatesData.rows) ? candidatesData.rows : [];

  const stats = {
    totalRequisitions: requisitions.length,
    openRequisitions: requisitions.filter((row) => ["open", "draft", "on_hold"].includes(String(row.status || "").toLowerCase())).length,
    totalCandidates: candidates.length,
    hiredCandidates: candidates.filter((row) => String(row.current_stage || "").toLowerCase() === "hired").length,
  };

  return { session, requisitions: requisitions.slice(0, 20), candidates: candidates.slice(0, 10), stats };
}

function readDate(value?: string | null) {
  return value ? String(value).slice(0, 10) : "";
}

function statusTone(status?: string | null) {
  switch (String(status || "").toLowerCase()) {
    case "open":
      return "bg-emerald-100 text-emerald-700";
    case "draft":
      return "bg-slate-100 text-slate-700";
    case "on_hold":
      return "bg-amber-100 text-amber-700";
    case "closed":
      return "bg-sky-100 text-sky-700";
    case "cancelled":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function stageTone(stage?: string | null) {
  switch (String(stage || "").toLowerCase()) {
    case "hired":
      return "bg-emerald-100 text-emerald-700";
    case "offer":
      return "bg-violet-100 text-violet-700";
    case "interview":
      return "bg-sky-100 text-sky-700";
    case "screening":
      return "bg-amber-100 text-amber-700";
    case "rejected":
    case "withdrawn":
      return "bg-rose-100 text-rose-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

async function readJson(res: Response) {
  return (await res.json().catch(() => ({}))) as Record<string, unknown>;
}

export default function AdminRecruitmentPage({ loaderData }: { loaderData: LoaderData }) {
  const { session, requisitions, candidates, stats } = loaderData;
  const [showCreateRequisition, setShowCreateRequisition] = useState(false);
  const [showCreateCandidate, setShowCreateCandidate] = useState(false);
  const [editingRequisition, setEditingRequisition] = useState<RequisitionRow | null>(null);
  const [statusRequisition, setStatusRequisition] = useState<RequisitionRow | null>(null);
  const [advanceCandidate, setAdvanceCandidate] = useState<CandidateRow | null>(null);
  const [viewRequisition, setViewRequisition] = useState<RequisitionRow | null>(null);
  const [requisitionDetail, setRequisitionDetail] = useState<RequisitionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [requisitionForm, setRequisitionForm] = useState({
    job_code: "",
    title: "",
    department: "",
    headcount: "1",
    employment_type: "full_time",
    status: "draft",
    target_start_date: "",
    description: "",
  });
  const [candidateForm, setCandidateForm] = useState({
    requisition_id: requisitions[0]?.id || "",
    full_name: "",
    email: "",
    phone: "",
    source: "",
    expected_salary: "",
    notes: "",
  });
  const [statusForm, setStatusForm] = useState({ status: "open" });
  const [advanceForm, setAdvanceForm] = useState({ to_stage: "screening", interviewer: "", note: "", scheduled_at: "", score: "" });

  function resetFeedback() {
    setError("");
    setSuccess("");
  }

  function closeAllModals() {
    setShowCreateRequisition(false);
    setShowCreateCandidate(false);
    setEditingRequisition(null);
    setStatusRequisition(null);
    setAdvanceCandidate(null);
    setViewRequisition(null);
    setRequisitionDetail(null);
    resetFeedback();
  }

  async function openRequisitionDetail(row: RequisitionRow) {
    resetFeedback();
    setViewRequisition(row);
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/recruitment/${row.id}`);
      const data = await readJson(res);
      if (!res.ok) {
        setError(String(data.error || "Failed to load requisition detail"));
        setRequisitionDetail({ requisition: row, candidates: [] });
        return;
      }
      setRequisitionDetail({
        requisition: (data.requisition as RequisitionRow | null) ?? row,
        candidates: Array.isArray(data.candidates) ? (data.candidates as CandidateRow[]) : [],
      });
    } catch {
      setError("Network error");
      setRequisitionDetail({ requisition: row, candidates: [] });
    } finally {
      setDetailLoading(false);
    }
  }

  async function createRequisition() {
    if (!requisitionForm.job_code.trim() || !requisitionForm.title.trim()) {
      setError("Job code and title are required");
      return;
    }
    setSaving(true);
    resetFeedback();
    try {
      const res = await fetch("/api/recruitment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create_requisition",
          job_code: requisitionForm.job_code.trim(),
          title: requisitionForm.title.trim(),
          department: requisitionForm.department.trim() || undefined,
          headcount: Number(requisitionForm.headcount),
          employment_type: requisitionForm.employment_type,
          status: requisitionForm.status,
          target_start_date: requisitionForm.target_start_date || undefined,
          description: requisitionForm.description.trim() || undefined,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(String(data.error || "Create requisition failed"));
        return;
      }
      setSuccess("Requisition created successfully");
      window.location.reload();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  function openEditRequisition(row: RequisitionRow) {
    resetFeedback();
    setRequisitionForm({
      job_code: row.job_code || "",
      title: row.title || "",
      department: row.department || "",
      headcount: String(row.headcount ?? 1),
      employment_type: row.employment_type || "full_time",
      status: row.status || "draft",
      target_start_date: readDate(row.target_start_date),
      description: row.description || "",
    });
    setEditingRequisition(row);
  }

  async function saveRequisitionEdit() {
    if (!editingRequisition || !requisitionForm.title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    resetFeedback();
    try {
      const res = await fetch(`/api/recruitment/${editingRequisition.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "update",
          title: requisitionForm.title.trim(),
          department: requisitionForm.department.trim(),
          headcount: Number(requisitionForm.headcount),
          target_start_date: requisitionForm.target_start_date || null,
          description: requisitionForm.description.trim() || null,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(String(data.error || "Update requisition failed"));
        return;
      }
      setSuccess("Requisition updated successfully");
      window.location.reload();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  function openRequisitionStatus(row: RequisitionRow) {
    resetFeedback();
    setStatusForm({ status: row.status || "open" });
    setStatusRequisition(row);
  }

  async function saveRequisitionStatus() {
    if (!statusRequisition) return;
    setSaving(true);
    resetFeedback();
    try {
      const res = await fetch(`/api/recruitment/${statusRequisition.id}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "set_status", status: statusForm.status }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(String(data.error || "Status update failed"));
        return;
      }
      setSuccess("Requisition status updated successfully");
      window.location.reload();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  async function createCandidate() {
    if (!candidateForm.requisition_id || !candidateForm.full_name.trim()) {
      setError("Requisition and candidate name are required");
      return;
    }
    setSaving(true);
    resetFeedback();
    try {
      const res = await fetch("/api/recruitment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "create_candidate",
          requisition_id: candidateForm.requisition_id,
          full_name: candidateForm.full_name.trim(),
          email: candidateForm.email.trim() || undefined,
          phone: candidateForm.phone.trim() || undefined,
          source: candidateForm.source.trim() || undefined,
          expected_salary: candidateForm.expected_salary ? Number(candidateForm.expected_salary) : undefined,
          notes: candidateForm.notes.trim() || undefined,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(String(data.error || "Create candidate failed"));
        return;
      }
      setSuccess("Candidate created successfully");
      window.location.reload();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  function openAdvanceCandidate(row: CandidateRow) {
    resetFeedback();
    setAdvanceForm({ to_stage: row.current_stage || "screening", interviewer: "", note: "", scheduled_at: "", score: "" });
    setAdvanceCandidate(row);
  }

  async function saveCandidateAdvance() {
    if (!advanceCandidate) return;
    setSaving(true);
    resetFeedback();
    try {
      const res = await fetch("/api/recruitment", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "advance_candidate",
          candidate_id: advanceCandidate.id,
          to_stage: advanceForm.to_stage,
          interviewer: advanceForm.interviewer.trim() || undefined,
          note: advanceForm.note.trim() || undefined,
          scheduled_at: advanceForm.scheduled_at || undefined,
          score: advanceForm.score ? Number(advanceForm.score) : undefined,
        }),
      });
      const data = await readJson(res);
      if (!res.ok) {
        setError(String(data.error || "Advance candidate failed"));
        return;
      }
      setSuccess("Candidate stage updated successfully");
      window.location.reload();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell title="Recruitment" session={session}>
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-[#d8dee8] bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-[#7c8ba1]">REQUISITIONS</p>
          <p className="mt-1 text-3xl font-bold text-[#1b2738]">{stats.totalRequisitions}</p>
        </article>
        <article className="rounded-xl border border-[#d8dee8] bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-[#7c8ba1]">OPEN / ACTIVE</p>
          <p className="mt-1 text-3xl font-bold text-[#1b2738]">{stats.openRequisitions}</p>
        </article>
        <article className="rounded-xl border border-[#d8dee8] bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-[#7c8ba1]">CANDIDATES</p>
          <p className="mt-1 text-3xl font-bold text-[#1b2738]">{stats.totalCandidates}</p>
        </article>
        <article className="rounded-xl border border-[#d8dee8] bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-[#7c8ba1]">HIRED</p>
          <p className="mt-1 text-3xl font-bold text-[#1b2738]">{stats.hiredCandidates}</p>
        </article>
      </section>

      <section className="mt-4 overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#e6ebf2] px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-[#1b2738]">Requisition Management</h2>
            <p className="mt-1 text-xs text-[#7c8ba1]">Open new hiring requests, maintain headcount, and manage requisition status.</p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => { resetFeedback(); setShowCreateCandidate(true); }} disabled={requisitions.length === 0} className="rounded-lg border border-[#2563eb] px-3 py-1.5 text-xs font-semibold text-[#2563eb] hover:bg-[#eef4ff] disabled:cursor-not-allowed disabled:opacity-50">+ Add Candidate</button>
            <button onClick={() => { resetFeedback(); setShowCreateRequisition(true); }} className="rounded-lg bg-[#2563eb] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#1d4ed8]">+ New Requisition</button>
          </div>
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
                <th className="px-4 py-3 text-left text-xs font-semibold">JOB CODE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">TITLE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">DEPARTMENT</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">HEADCOUNT</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">STATUS</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {requisitions.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3 font-medium">{row.job_code || "-"}</td>
                  <td className="px-4 py-3">{row.title || "-"}</td>
                  <td className="px-4 py-3">{row.department || "-"}</td>
                  <td className="px-4 py-3">{row.headcount ?? "-"}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${statusTone(row.status)}`}>{row.status || "-"}</span></td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <button onClick={() => void openRequisitionDetail(row)} className="text-xs font-medium text-[#2563eb] hover:underline">Detail</button>
                      <button onClick={() => openEditRequisition(row)} className="text-xs font-medium text-[#2563eb] hover:underline">Edit</button>
                      <button onClick={() => openRequisitionStatus(row)} className="text-xs font-medium text-[#2563eb] hover:underline">Status</button>
                    </div>
                  </td>
                </tr>
              ))}
              {requisitions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[#8a97ac]">No recruitment requisitions. Create one to start hiring workflow.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-4 overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Candidate Pipeline</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">NAME</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">REQUISITION</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">SOURCE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">STAGE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">DATE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">ACTION</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3 font-medium">{row.full_name || "-"}</td>
                  <td className="px-4 py-3 text-xs text-[#5b6d85]">{requisitions.find((req) => req.id === row.requisition_id)?.job_code || row.requisition_id || "-"}</td>
                  <td className="px-4 py-3">{row.source || "-"}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${stageTone(row.current_stage)}`}>{row.current_stage || "-"}</span></td>
                  <td className="px-4 py-3">{row.created_at ? new Date(row.created_at).toLocaleDateString("th-TH") : "-"}</td>
                  <td className="px-4 py-3"><button onClick={() => openAdvanceCandidate(row)} className="text-xs font-medium text-[#2563eb] hover:underline">Advance Stage</button></td>
                </tr>
              ))}
              {candidates.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[#8a97ac]">No candidate data yet. Add candidates against an active requisition.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {showCreateRequisition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-[#1b2738]">New Requisition</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Job Code *</label>
                <input value={requisitionForm.job_code} onChange={e => setRequisitionForm(f => ({ ...f, job_code: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="REC-001" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Title *</label>
                <input value={requisitionForm.title} onChange={e => setRequisitionForm(f => ({ ...f, title: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="Warehouse Supervisor" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Department</label>
                <input value={requisitionForm.department} onChange={e => setRequisitionForm(f => ({ ...f, department: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Headcount</label>
                <input type="number" min="1" value={requisitionForm.headcount} onChange={e => setRequisitionForm(f => ({ ...f, headcount: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Employment Type</label>
                <select value={requisitionForm.employment_type} onChange={e => setRequisitionForm(f => ({ ...f, employment_type: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm">
                  {EMPLOYMENT_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Initial Status</label>
                <select value={requisitionForm.status} onChange={e => setRequisitionForm(f => ({ ...f, status: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm">
                  {REQUISITION_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Target Start Date</label>
                <input type="date" value={requisitionForm.target_start_date} onChange={e => setRequisitionForm(f => ({ ...f, target_start_date: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Description</label>
                <textarea value={requisitionForm.description} onChange={e => setRequisitionForm(f => ({ ...f, description: e.target.value }))} rows={4} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
            </div>
            {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={closeAllModals} className="rounded-lg border border-[#d8dee8] px-4 py-2 text-sm text-[#5b6d85] hover:bg-[#f7f9fc]">Cancel</button>
              <button onClick={createRequisition} disabled={saving} className="rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">{saving ? "Saving..." : "Create Requisition"}</button>
            </div>
          </div>
        </div>
      )}

      {editingRequisition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-[#1b2738]">Edit Requisition</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Job Code</label>
                <input value={requisitionForm.job_code} disabled className="w-full rounded-lg border border-[#d8dee8] bg-[#f7f9fc] px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Title *</label>
                <input value={requisitionForm.title} onChange={e => setRequisitionForm(f => ({ ...f, title: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Department</label>
                <input value={requisitionForm.department} onChange={e => setRequisitionForm(f => ({ ...f, department: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Headcount</label>
                <input type="number" min="1" value={requisitionForm.headcount} onChange={e => setRequisitionForm(f => ({ ...f, headcount: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Target Start Date</label>
                <input type="date" value={requisitionForm.target_start_date} onChange={e => setRequisitionForm(f => ({ ...f, target_start_date: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Description</label>
                <textarea value={requisitionForm.description} onChange={e => setRequisitionForm(f => ({ ...f, description: e.target.value }))} rows={4} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
            </div>
            {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={closeAllModals} className="rounded-lg border border-[#d8dee8] px-4 py-2 text-sm text-[#5b6d85] hover:bg-[#f7f9fc]">Cancel</button>
              <button onClick={saveRequisitionEdit} disabled={saving} className="rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">{saving ? "Saving..." : "Save Changes"}</button>
            </div>
          </div>
        </div>
      )}

      {statusRequisition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-[#1b2738]">Update Requisition Status</h3>
            <div>
              <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Status</label>
              <select value={statusForm.status} onChange={e => setStatusForm({ status: e.target.value })} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm">
                {REQUISITION_STATUSES.map(status => <option key={status} value={status}>{status}</option>)}
              </select>
            </div>
            {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={closeAllModals} className="rounded-lg border border-[#d8dee8] px-4 py-2 text-sm text-[#5b6d85] hover:bg-[#f7f9fc]">Cancel</button>
              <button onClick={saveRequisitionStatus} disabled={saving} className="rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">{saving ? "Saving..." : "Update Status"}</button>
            </div>
          </div>
        </div>
      )}

      {showCreateCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-[#1b2738]">Add Candidate</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Requisition *</label>
                <select value={candidateForm.requisition_id} onChange={e => setCandidateForm(f => ({ ...f, requisition_id: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm">
                  <option value="">Select requisition</option>
                  {requisitions.map((req) => <option key={req.id} value={req.id}>{req.job_code} - {req.title}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Candidate Name *</label>
                <input value={candidateForm.full_name} onChange={e => setCandidateForm(f => ({ ...f, full_name: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Source</label>
                <input value={candidateForm.source} onChange={e => setCandidateForm(f => ({ ...f, source: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="Referral / Facebook / Walk-in" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Email</label>
                <input type="email" value={candidateForm.email} onChange={e => setCandidateForm(f => ({ ...f, email: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Phone</label>
                <input value={candidateForm.phone} onChange={e => setCandidateForm(f => ({ ...f, phone: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Expected Salary</label>
                <input type="number" min="0" value={candidateForm.expected_salary} onChange={e => setCandidateForm(f => ({ ...f, expected_salary: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Notes</label>
                <textarea value={candidateForm.notes} onChange={e => setCandidateForm(f => ({ ...f, notes: e.target.value }))} rows={4} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
            </div>
            {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={closeAllModals} className="rounded-lg border border-[#d8dee8] px-4 py-2 text-sm text-[#5b6d85] hover:bg-[#f7f9fc]">Cancel</button>
              <button onClick={createCandidate} disabled={saving} className="rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">{saving ? "Saving..." : "Create Candidate"}</button>
            </div>
          </div>
        </div>
      )}

      {advanceCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-2xl rounded-xl bg-white p-6 shadow-xl">
            <h3 className="mb-4 text-base font-semibold text-[#1b2738]">Advance Candidate Stage</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">To Stage</label>
                <select value={advanceForm.to_stage} onChange={e => setAdvanceForm(f => ({ ...f, to_stage: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm">
                  {CANDIDATE_STAGES.map(stage => <option key={stage} value={stage}>{stage}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Interviewer</label>
                <input value={advanceForm.interviewer} onChange={e => setAdvanceForm(f => ({ ...f, interviewer: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Scheduled At</label>
                <input type="datetime-local" value={advanceForm.scheduled_at} onChange={e => setAdvanceForm(f => ({ ...f, scheduled_at: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Score</label>
                <input type="number" min="0" max="100" value={advanceForm.score} onChange={e => setAdvanceForm(f => ({ ...f, score: e.target.value }))} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-medium text-[#5b6d85]">Note</label>
                <textarea value={advanceForm.note} onChange={e => setAdvanceForm(f => ({ ...f, note: e.target.value }))} rows={4} className="w-full rounded-lg border border-[#d8dee8] px-3 py-2 text-sm" placeholder="Interview outcome, next step, or rejection reason" />
              </div>
            </div>
            {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={closeAllModals} className="rounded-lg border border-[#d8dee8] px-4 py-2 text-sm text-[#5b6d85] hover:bg-[#f7f9fc]">Cancel</button>
              <button onClick={saveCandidateAdvance} disabled={saving} className="rounded-lg bg-[#2563eb] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1d4ed8] disabled:opacity-50">{saving ? "Saving..." : "Advance Stage"}</button>
            </div>
          </div>
        </div>
      )}

      {viewRequisition && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-4xl rounded-xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-[#1b2738]">Requisition Detail</h3>
                <p className="mt-1 text-xs text-[#7c8ba1]">{viewRequisition.job_code || viewRequisition.id}</p>
              </div>
              <button onClick={closeAllModals} className="rounded-lg border border-[#d8dee8] px-3 py-1.5 text-xs text-[#5b6d85] hover:bg-[#f7f9fc]">Close</button>
            </div>
            {detailLoading ? (
              <p className="mt-4 text-sm text-[#7c8ba1]">Loading requisition detail...</p>
            ) : (
              <>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-[#e6ebf2] bg-[#f7f9fc] p-4">
                    <p className="text-xs font-semibold tracking-wide text-[#7c8ba1]">TITLE</p>
                    <p className="mt-1 text-sm font-medium text-[#1b2738]">{requisitionDetail?.requisition?.title || viewRequisition.title || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-[#e6ebf2] bg-[#f7f9fc] p-4">
                    <p className="text-xs font-semibold tracking-wide text-[#7c8ba1]">STATUS</p>
                    <p className="mt-1 text-sm font-medium text-[#1b2738]">{requisitionDetail?.requisition?.status || viewRequisition.status || "-"}</p>
                  </div>
                  <div className="rounded-xl border border-[#e6ebf2] bg-[#f7f9fc] p-4">
                    <p className="text-xs font-semibold tracking-wide text-[#7c8ba1]">HEADCOUNT</p>
                    <p className="mt-1 text-sm font-medium text-[#1b2738]">{requisitionDetail?.requisition?.headcount ?? viewRequisition.headcount ?? "-"}</p>
                  </div>
                  <div className="rounded-xl border border-[#e6ebf2] bg-[#f7f9fc] p-4">
                    <p className="text-xs font-semibold tracking-wide text-[#7c8ba1]">TARGET START DATE</p>
                    <p className="mt-1 text-sm font-medium text-[#1b2738]">{requisitionDetail?.requisition?.target_start_date ? new Date(requisitionDetail.requisition.target_start_date).toLocaleDateString("th-TH") : "-"}</p>
                  </div>
                  <div className="rounded-xl border border-[#e6ebf2] bg-[#f7f9fc] p-4 md:col-span-2">
                    <p className="text-xs font-semibold tracking-wide text-[#7c8ba1]">DESCRIPTION</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-[#1b2738]">{requisitionDetail?.requisition?.description || "-"}</p>
                  </div>
                </div>
                <div className="mt-5 overflow-hidden rounded-xl border border-[#d8dee8]">
                  <div className="border-b border-[#e6ebf2] px-4 py-3">
                    <h4 className="text-sm font-semibold text-[#1b2738]">Candidates in This Requisition</h4>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[780px] text-sm">
                      <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold">NAME</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold">EMAIL</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold">PHONE</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold">STAGE</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold">SOURCE</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(requisitionDetail?.candidates || []).map((candidate) => (
                          <tr key={candidate.id} className="border-t border-[#edf1f7]">
                            <td className="px-4 py-3 font-medium">{candidate.full_name || "-"}</td>
                            <td className="px-4 py-3">{candidate.email || "-"}</td>
                            <td className="px-4 py-3">{candidate.phone || "-"}</td>
                            <td className="px-4 py-3">{candidate.current_stage || "-"}</td>
                            <td className="px-4 py-3">{candidate.source || "-"}</td>
                          </tr>
                        ))}
                        {(requisitionDetail?.candidates || []).length === 0 ? (
                          <tr>
                            <td colSpan={5} className="px-4 py-6 text-center text-[#8a97ac]">No candidates assigned to this requisition yet.</td>
                          </tr>
                        ) : null}
                      </tbody>
                    </table>
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