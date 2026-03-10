"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/context/LanguageContext";
import { useSession } from "@/app/hooks/useSession";

const VIEW_ALLOWED_ROLES = new Set([
  "admin",
  "super_admin",
  "hr_payroll",
  "hr-payroll",
  "hr payroll",
  "hrpayroll",
]);

function canViewAudit(role) {
  const normalized = String(role || "").trim().toLowerCase();
  return VIEW_ALLOWED_ROLES.has(normalized);
}

export default function PinResetAuditPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const { session, loading: sessionLoading, getAuthHeaders } = useSession();
  const L = t.pinResetAudit;

  const [searchEmpId, setSearchEmpId] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const allowed = useMemo(() => canViewAudit(session?.role), [session?.role]);

  async function loadRows(empId = "") {
    setLoading(true);
    setError("");

    try {
      const query = new URLSearchParams();
      query.set("limit", "100");
      if (empId.trim()) query.set("emp_id", empId.trim().toUpperCase());

      const res = await fetch(`/api/login/admin/pin-reset-audit?${query.toString()}`, {
        headers: {
          ...getAuthHeaders(),
        },
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.error === "FORBIDDEN") setError(L.errForbidden);
        else setError(L.errGeneral);
        return;
      }

      setRows(data.rows || []);
    } catch {
      setError(L.errGeneral);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (sessionLoading) return;
    if (!allowed) {
      router.replace("/dashboard");
      return;
    }
    loadRows();
  }, [sessionLoading, allowed, router]);

  if (sessionLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] text-[#6B7A99]">
        Loading...
      </div>
    );
  }

  if (!allowed) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#F5F7FA] p-4 sm:p-6 lg:p-8 text-[#1A2B4A]">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl sm:text-3xl font-bold">{L.title}</h1>
        <p className="text-sm text-[#6B7A99] mt-1">{L.subtitle}</p>

        <div className="mt-5 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={searchEmpId}
            onChange={(e) => setSearchEmpId(e.target.value)}
            placeholder={L.searchPlaceholder}
            className="w-full sm:w-72 rounded-lg border border-[#D0D8E4] bg-white px-3 py-2 text-sm focus:outline-none focus:border-[#1352A3]"
          />
          <button
            type="button"
            onClick={() => loadRows(searchEmpId)}
            className="rounded-lg bg-[#1352A3] hover:bg-[#0D3B7A] text-white px-4 py-2 text-sm font-semibold transition"
          >
            {L.searchBtn}
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchEmpId("");
              loadRows("");
            }}
            className="rounded-lg border border-[#D0D8E4] bg-white px-4 py-2 text-sm font-semibold text-[#334260] hover:bg-[#F5F7FA] transition"
          >
            {L.clearBtn}
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-5 overflow-x-auto rounded-xl border border-[#D0D8E4] bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-[#E8F0FB] text-[#1A2B4A]">
              <tr>
                <th className="px-3 py-2 text-left">{L.colTime}</th>
                <th className="px-3 py-2 text-left">{L.colTarget}</th>
                <th className="px-3 py-2 text-left">{L.colActor}</th>
                <th className="px-3 py-2 text-left">{L.colRole}</th>
                <th className="px-3 py-2 text-left">{L.colIp}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-3 py-4 text-[#6B7A99]" colSpan={5}>{L.loading}</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-[#6B7A99]" colSpan={5}>{L.noData}</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-[#EEF2F7]">
                    <td className="px-3 py-2 whitespace-nowrap">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="px-3 py-2 whitespace-nowrap font-semibold">{row.target_emp_id}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.reset_by_emp_id}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.reset_by_role}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{row.ip_address || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
