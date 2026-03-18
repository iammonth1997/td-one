"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/app/hooks/useSession";

const ALLOWED = new Set(["admin", "super_admin", "hr_payroll", "hr-payroll", "hr payroll", "hrpayroll"]);

export default function DeviceBindingAdminPage() {
  const router = useRouter();
  const { session, loading, getAuthHeaders } = useSession({
    loginPath: "/admin/login",
    requiredPortal: "admin_portal",
  });
  const [rows, setRows] = useState([]);
  const [empCode, setEmpCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const role = String(session?.role || "").trim().toLowerCase();
  const allowed = ALLOWED.has(role);

  const loadRows = useCallback(async () => {
    const res = await fetch("/api/attendance/admin/reset-device", { headers: getAuthHeaders() });
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

  async function resetByCode(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const code = empCode.trim().toUpperCase();
      const res = await fetch("/api/attendance/admin/reset-device", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ employee_code: code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "RESET_FAILED");
      setSuccess(`Reset device binding for ${data.employee_code}`);
      setEmpCode("");
      await loadRows();
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-white text-[#555555]">Loading...</div>;
  if (!allowed) return null;

  return (
    <main className="min-h-screen bg-white p-6 text-[#111111]">
      <div className="mx-auto max-w-6xl space-y-4">
        <h1 className="text-2xl font-bold">Reset Device Binding</h1>

        <form onSubmit={resetByCode} className="flex flex-col gap-3 rounded-[1rem] border border-[#FECACA] bg-white p-4 shadow-[0_12px_28px_rgba(220,38,38,0.12)] sm:flex-row">
          <input
            className="w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] placeholder:text-[#777777] focus:outline-none focus:border-[#DC2626] sm:w-72"
            placeholder="Employee code (e.g. L2506110)"
            value={empCode}
            onChange={(e) => setEmpCode(e.target.value)}
          />
          <button disabled={busy} className="rounded-xl bg-[#DC2626] px-4 py-2 font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.24)] transition hover:bg-[#991B1B] disabled:opacity-50">Reset Device</button>
        </form>

        {error ? <p className="text-sm text-[#FCA5A5]">{error}</p> : null}
        {success ? <p className="text-sm text-[#86EFAC]">{success}</p> : null}

        <div className="overflow-x-auto rounded-[1rem] border border-[#FECACA] bg-white shadow-[0_12px_28px_rgba(0,0,0,0.24)]">
          <table className="min-w-full text-sm">
            <thead className="bg-white text-[#555555]">
              <tr>
                <th className="px-3 py-2 text-left">Employee ID (UUID)</th>
                <th className="px-3 py-2 text-left">Device ID</th>
                <th className="px-3 py-2 text-left">Device Name</th>
                <th className="px-3 py-2 text-left">Active</th>
                <th className="px-3 py-2 text-left">Registered</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-[#FECACA]">
                  <td className="px-3 py-2 font-mono text-xs text-[#888888]">{row.employee_id}</td>
                  <td className="px-3 py-2 font-mono text-xs text-[#888888]">{row.device_id}</td>
                  <td className="px-3 py-2 text-[#444444]">{row.device_name || "-"}</td>
                  <td className="px-3 py-2 text-[#444444]">{row.is_active ? "Yes" : "No"}</td>
                  <td className="px-3 py-2 font-mono text-[#888888]">{new Date(row.registered_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
