"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

const ISSUE_ALLOWED_ROLES = new Set([
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
  const { session, loading: sessionLoading, getAuthHeaders } = useSession({
    loginPath: "/admin/login",
    requiredPortal: "admin_portal",
  });
  const L = t.pinResetAudit;

  const [searchEmpId, setSearchEmpId] = useState("");
  const [issueEmpId, setIssueEmpId] = useState("");
  const [issueLoading, setIssueLoading] = useState(false);
  const [issueError, setIssueError] = useState("");
  const [issuedTempPin, setIssuedTempPin] = useState("");
  const [issuedExpiry, setIssuedExpiry] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const allowed = useMemo(() => canViewAudit(session?.role), [session?.role]);
  const canIssue = useMemo(() => {
    const normalized = String(session?.role || "").trim().toLowerCase();
    return ISSUE_ALLOWED_ROLES.has(normalized);
  }, [session?.role]);

  async function issueTempPin() {
    if (issueLoading) return;
    setIssueError("");
    setIssuedTempPin("");
    setIssuedExpiry("");

    const target = issueEmpId.trim().toUpperCase();
    if (!target) {
      setIssueError("Employee ID is required.");
      return;
    }

    setIssueLoading(true);
    try {
      const res = await fetch("/api/login/admin/issue-temp-pin", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ emp_id: target }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.error === "FORBIDDEN") setIssueError("You are not allowed to issue temporary PIN.");
        else if (data.error === "USER_NOT_FOUND") setIssueError("Employee ID not found.");
        else setIssueError("Unable to issue temporary PIN. Please try again.");
        return;
      }

      setIssuedTempPin(data.temp_pin || "");
      setIssuedExpiry(data.expires_at || "");
      loadRows();
    } catch {
      setIssueError("Unable to issue temporary PIN. Please try again.");
    } finally {
      setIssueLoading(false);
    }
  }

  const loadRows = useCallback(async (empId = "") => {
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
  }, [L.errForbidden, L.errGeneral, getAuthHeaders]);

  useEffect(() => {
    if (sessionLoading) return;
    if (!allowed) {
      router.replace("/admin");
      return;
    }
    loadRows();
  }, [sessionLoading, allowed, loadRows, router]);

  if (sessionLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-[#555555]">
        Loading...
      </div>
    );
  }

  if (!allowed) {
    return null;
  }

  return (
    <main className="min-h-screen bg-white p-4 text-[#111111] sm:p-6 lg:p-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="text-2xl sm:text-3xl font-bold">{L.title}</h1>
        <p className="mt-1 text-sm text-[#777777]">{L.subtitle}</p>

        <div className="mt-5 rounded-[1rem] border border-[#FECACA] bg-white p-4 shadow-[0_12px_28px_rgba(220,38,38,0.12)]">
          <h2 className="text-lg font-semibold">Issue Temporary PIN (One-time)</h2>
          <p className="mt-1 text-xs text-[#777777]">Temporary PIN expires in 15 minutes and user must change PIN after login.</p>

          <div className="mt-3 flex flex-col sm:flex-row gap-3">
            <input
              type="text"
              value={issueEmpId}
              onChange={(e) => setIssueEmpId(e.target.value)}
              placeholder="Employee ID"
              className="w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-sm text-[#111111] placeholder:text-[#777777] focus:outline-none focus:border-[#DC2626] sm:w-72"
              disabled={!canIssue || issueLoading}
            />
            <button
              type="button"
              onClick={issueTempPin}
              disabled={!canIssue || issueLoading}
              className="rounded-xl bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.24)] transition hover:bg-[#991B1B] disabled:opacity-60"
            >
              {issueLoading ? "Issuing..." : "Issue Temp PIN"}
            </button>
          </div>

          {!canIssue && (
            <p className="mt-3 text-sm text-[#FCA5A5]">Only HR Payroll or Super Admin can issue temporary PIN.</p>
          )}
          {issueError && <p className="mt-3 text-sm text-[#FCA5A5]">{issueError}</p>}
          {issuedTempPin && (
            <div className="mt-3 rounded-xl border border-[#FCD34D] bg-[#FFF7ED] p-3">
              <p className="text-xs text-[#92400E]">Share this PIN securely with employee (shown only once).</p>
              <p className="mt-1 text-xl font-bold tracking-wider text-[#B45309]">{issuedTempPin}</p>
              <p className="mt-1 text-xs text-[#92400E]">Expires: {new Date(issuedExpiry).toLocaleString()}</p>
            </div>
          )}
        </div>

        <div className="mt-5 flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={searchEmpId}
            onChange={(e) => setSearchEmpId(e.target.value)}
            placeholder={L.searchPlaceholder}
            className="w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-sm text-[#111111] placeholder:text-[#777777] focus:outline-none focus:border-[#DC2626] sm:w-72"
          />
          <button
            type="button"
            onClick={() => loadRows(searchEmpId)}
            className="rounded-xl bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.24)] transition hover:bg-[#991B1B]"
          >
            {L.searchBtn}
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchEmpId("");
              loadRows("");
            }}
            className="rounded-xl border border-[#FECACA] bg-white px-4 py-2 text-sm font-semibold text-[#444444] transition hover:bg-[#FEF2F2]"
          >
            {L.clearBtn}
          </button>
        </div>

        {error && <p className="mt-4 text-sm text-[#FCA5A5]">{error}</p>}

        <div className="mt-5 overflow-x-auto rounded-[1rem] border border-[#FECACA] bg-white shadow-[0_12px_28px_rgba(0,0,0,0.24)]">
          <table className="min-w-full text-sm">
            <thead className="bg-white text-[#555555]">
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
                  <td className="px-3 py-4 text-[#555555]" colSpan={5}>{L.loading}</td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-3 py-4 text-[#555555]" colSpan={5}>{L.noData}</td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-[#FECACA]">
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[#888888]">{new Date(row.created_at).toLocaleString()}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-[#444444]">{row.target_emp_id}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-[#444444]">{row.reset_by_emp_id}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-[#444444]">{row.reset_by_role}</td>
                    <td className="whitespace-nowrap px-3 py-2 font-mono text-[#888888]">{row.ip_address || "-"}</td>
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
