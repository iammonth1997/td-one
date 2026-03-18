import { useState, useEffect } from "react";
import { Link, redirect } from "react-router";
import type { Route } from "./+types/request.time-correction";
import { validateSession } from "~/lib/session-validation.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { session, error } = await validateSession(request, context);
  if (error || !session) throw redirect("/login");
  return { empId: session.emp_id };
}

type CorrectionRow = { id: number; date: string; correction_type: string; requested_scan_in: string | null; requested_scan_out: string | null; reason: string; status: string };

export default function RequestTimeCorrectionPage(_props: Route.ComponentProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [rows, setRows] = useState<CorrectionRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ date: today, correction_type: "forgot_in", requested_scan_in: "08:00", requested_scan_out: "17:00", reason: "" });

  async function loadData() {
    const res = await fetch("/api/time-correction-request");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error || "LOAD_FAILED");
    setRows(data.rows || []);
  }

  useEffect(() => { loadData().catch((e) => setError(String(e.message || e))); }, []);

  const needIn = form.correction_type === "forgot_in" || form.correction_type === "forgot_both";
  const needOut = form.correction_type === "forgot_out" || form.correction_type === "forgot_both";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/time-correction-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: form.date,
          correction_type: form.correction_type,
          requested_scan_in: needIn ? form.requested_scan_in : null,
          requested_scan_out: needOut ? form.requested_scan_out : null,
          reason: form.reason,
        }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      if (!res.ok) { setError(data.error || "เกิดข้อผิดพลาด"); return; }
      setSuccess("ยื่นคำขอแก้ไขเวลาสำเร็จ");
      setForm((s) => ({ ...s, reason: "" }));
      await loadData();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-white px-4 py-6 text-[#111111] sm:px-6 sm:py-10">
      <section className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_12px_32px_rgba(220,38,38,0.12)]">
          <div>
            <h1 className="text-2xl font-bold text-[#111111]">⏱️ แก้ไขเวลา</h1>
            <p className="mt-1 text-sm text-[#555555]">แจ้งแก้ไขเวลาสแกนที่ผิดพลาดหรือลืมสแกน</p>
          </div>
          <Link to="/request" className="text-sm text-[#DC2626] transition hover:text-[#991B1B]">← กลับ</Link>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_10px_28px_rgba(220,38,38,0.10)]">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-[#555555]">วันที่</label>
              <input type="date" value={form.date} onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))} className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] focus:border-[#DC2626]" />
            </div>
            <div>
              <label className="text-sm font-semibold text-[#555555]">ประเภทการแก้ไข</label>
              <select value={form.correction_type} onChange={(e) => setForm((s) => ({ ...s, correction_type: e.target.value }))} className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] focus:border-[#DC2626]">
                <option value="forgot_in">ลืมสแกนเข้า</option>
                <option value="forgot_out">ลืมสแกนออก</option>
                <option value="forgot_both">ลืมทั้งเข้าและออก</option>
              </select>
            </div>
            {needIn ? (
              <div>
                <label className="text-sm font-semibold text-[#555555]">เวลาเข้า (จริง)</label>
                <input type="time" value={form.requested_scan_in} onChange={(e) => setForm((s) => ({ ...s, requested_scan_in: e.target.value }))} className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] focus:border-[#DC2626]" />
              </div>
            ) : null}
            {needOut ? (
              <div>
                <label className="text-sm font-semibold text-[#555555]">เวลาออก (จริง)</label>
                <input type="time" value={form.requested_scan_out} onChange={(e) => setForm((s) => ({ ...s, requested_scan_out: e.target.value }))} className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] focus:border-[#DC2626]" />
              </div>
            ) : null}
          </div>

          <div>
            <label className="text-sm font-semibold text-[#555555]">เหตุผล</label>
            <textarea value={form.reason} onChange={(e) => setForm((s) => ({ ...s, reason: e.target.value }))} className="mt-1 min-h-24 w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] focus:border-[#DC2626]" />
          </div>

          {error ? <div className="text-sm text-[#DC2626]">{error}</div> : null}
          {success ? <div className="text-sm text-[#15803D]">{success}</div> : null}

          <button disabled={busy || !form.reason.trim()} className="w-full rounded-xl bg-[#DC2626] px-6 py-2.5 font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.24)] transition hover:bg-[#991B1B] disabled:opacity-50 md:w-auto">
            {busy ? "กำลังดำเนินการ..." : "ยื่นคำขอ"}
          </button>
        </form>

        <section className="rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_10px_28px_rgba(220,38,38,0.10)]">
          <h3 className="mb-3 text-lg font-bold text-[#DC2626]">ประวัติคำขอแก้ไขเวลา</h3>
          {rows.length === 0 ? <p className="text-sm text-[#555555]">ไม่มีข้อมูล</p> : (
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.id} className="rounded-xl border border-[#FECACA] bg-white p-3 text-sm">
                  <p className="font-semibold text-[#111111]">{row.date} – {row.correction_type}</p>
                  <p className="text-[#444444]">เวลาเข้า: {row.requested_scan_in || "-"} / เวลาออก: {row.requested_scan_out || "-"}</p>
                  <p className="mt-1 text-xs text-[#444444]">สถานะ: <strong>{row.status}</strong></p>
                  <p className="mt-1 text-xs text-[#555555]">{row.reason}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
