import type { Route } from "./+types/admin.recruitment";
import AdminShell from "~/components/admin-shell";
import { requireAdminSession } from "~/lib/require-admin-session.server";
import { fetchJsonOrEmpty } from "~/lib/safe-server-fetch.server";

type RequisitionRow = {
  id: string;
  job_code?: string | null;
  title?: string | null;
  department?: string | null;
  headcount?: number | null;
  employment_type?: string | null;
  status?: string | null;
  target_start_date?: string | null;
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
  created_at?: string | null;
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

export async function loader({ request, context }: Route.LoaderArgs): Promise<LoaderData> {
  const session = await requireAdminSession(request, context);
  const cookie = request.headers.get("cookie") ?? "";

  const requisitionsUrl = new URL(request.url);
  requisitionsUrl.pathname = "/api/recruitment";
  requisitionsUrl.search = "?limit=50";

  const candidatesUrl = new URL(request.url);
  candidatesUrl.pathname = "/api/recruitment";
  candidatesUrl.search = "?view=candidates&limit=50";

  const [requisitionsData, candidatesData] = await Promise.all([
    fetchJsonOrEmpty(requisitionsUrl.toString(), cookie),
    fetchJsonOrEmpty(candidatesUrl.toString(), cookie),
  ]);

  const requisitions = Array.isArray(requisitionsData.rows) ? (requisitionsData.rows as RequisitionRow[]) : [];
  const candidates = Array.isArray(candidatesData.rows) ? (candidatesData.rows as CandidateRow[]) : [];

  return {
    session,
    requisitions: requisitions.slice(0, 20),
    candidates: candidates.slice(0, 20),
    stats: {
      totalRequisitions: requisitions.length,
      openRequisitions: requisitions.filter((row) => ["open", "draft", "on_hold"].includes(String(row.status || "").toLowerCase())).length,
      totalCandidates: candidates.length,
      hiredCandidates: candidates.filter((row) => String(row.current_stage || "").toLowerCase() === "hired").length,
    },
  };
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString("th-TH");
}

export default function AdminRecruitmentPage({ loaderData }: Route.ComponentProps) {
  const { session, requisitions, candidates, stats } = loaderData;

  return (
    <AdminShell title="Recruitment" session={session}>
      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-xl border border-[#d8dee8] bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-[#7c8ba1]">REQUISITIONS</p>
          <p className="mt-1 text-3xl font-bold text-[#1b2738]">{stats.totalRequisitions}</p>
        </article>
        <article className="rounded-xl border border-[#d8dee8] bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold tracking-wide text-[#7c8ba1]">OPEN ROLES</p>
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
        <div className="border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Requisitions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">JOB CODE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">TITLE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">DEPARTMENT</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">STATUS</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">HEADCOUNT</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">TARGET START</th>
              </tr>
            </thead>
            <tbody>
              {requisitions.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3 font-medium">{row.job_code || "-"}</td>
                  <td className="px-4 py-3">{row.title || "-"}</td>
                  <td className="px-4 py-3">{row.department || "-"}</td>
                  <td className="px-4 py-3">{row.status || "-"}</td>
                  <td className="px-4 py-3">{row.headcount ?? "-"}</td>
                  <td className="px-4 py-3">{formatDate(row.target_start_date)}</td>
                </tr>
              ))}
              {requisitions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[#8a97ac]">No requisitions available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-4 overflow-hidden rounded-xl border border-[#d8dee8] bg-white shadow-sm">
        <div className="border-b border-[#e6ebf2] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#1b2738]">Recent Candidates</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-[#f7f9fc] text-[#7c8ba1]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold">NAME</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">EMAIL</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">PHONE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">SOURCE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">STAGE</th>
                <th className="px-4 py-3 text-left text-xs font-semibold">CREATED</th>
              </tr>
            </thead>
            <tbody>
              {candidates.map((row) => (
                <tr key={row.id} className="border-t border-[#edf1f7]">
                  <td className="px-4 py-3 font-medium">{row.full_name || "-"}</td>
                  <td className="px-4 py-3">{row.email || "-"}</td>
                  <td className="px-4 py-3">{row.phone || "-"}</td>
                  <td className="px-4 py-3">{row.source || "-"}</td>
                  <td className="px-4 py-3">{row.current_stage || "-"}</td>
                  <td className="px-4 py-3">{formatDate(row.created_at)}</td>
                </tr>
              ))}
              {candidates.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-[#8a97ac]">No candidates available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
