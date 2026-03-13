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

  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  if (!allowed) return null;

  return (
    <main className="min-h-screen bg-[#F5F7FA] p-6 text-[#1A2B4A]">
      <div className="mx-auto max-w-6xl space-y-4">
        <h1 className="text-2xl font-bold">Reset Device Binding</h1>

        <form onSubmit={resetByCode} className="rounded-xl border border-[#D0D8E4] bg-white p-4 flex flex-col sm:flex-row gap-3">
          <input
            className="border rounded px-3 py-2 w-full sm:w-72"
            placeholder="Employee code (e.g. L2506110)"
            value={empCode}
            onChange={(e) => setEmpCode(e.target.value)}
          />
          <button disabled={busy} className="bg-[#1352A3] text-white rounded px-4 py-2 font-semibold">Reset Device</button>
        </form>

        {error ? <p className="text-red-600 text-sm">{error}</p> : null}
        {success ? <p className="text-green-600 text-sm">{success}</p> : null}

        <div className="rounded-xl border border-[#D0D8E4] bg-white overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[#E8F0FB]">
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
                <tr key={row.id} className="border-t">
                  <td className="px-3 py-2 font-mono text-xs">{row.employee_id}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.device_id}</td>
                  <td className="px-3 py-2">{row.device_name || "-"}</td>
                  <td className="px-3 py-2">{row.is_active ? "Yes" : "No"}</td>
                  <td className="px-3 py-2">{new Date(row.registered_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
