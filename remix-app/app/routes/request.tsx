import { useState, useEffect } from "react";
import { Link, redirect } from "react-router";
import type { Route } from "./+types/request";
import { validateSession } from "~/lib/session-validation.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { session, error } = await validateSession(request, context);
  if (error || !session) throw redirect("/login");
  return { empId: session.emp_id };
}

type HistoryRow = {
  id: number;
  type: string;
  title: string;
  date_label: string;
  amount_label: string;
  reason: string;
  status_tag: string;
};

export default function RequestPage(_props: Route.ComponentProps) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadHistory(t = type, s = status) {
    setBusy(true);
    setError("");
    try {
      const qs = new URLSearchParams({ type: t, status: s });
      const res = await fetch(`/api/request-history?${qs}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      if (!res.ok) throw new Error(data.error || "LOAD_HISTORY_FAILED");
      setRows(data.rows || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => { loadHistory(); }, []);

  return (
    <main className="min-h-screen bg-white px-4 py-6 text-[#111111] sm:px-6 sm:py-10">
      <section className="mx-auto max-w-6xl space-y-4">
        <div className="rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_12px_32px_rgba(220,38,38,0.12)]">
          <h1 className="text-2xl font-bold text-[#111111]">ศูนย์คำขอ</h1>
          <p className="mt-1 text-sm text-[#555555]">ยื่นคำขอลา แก้ไขเวลา หรือ OT</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Link to="/request/leave" className="rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_10px_28px_rgba(220,38,38,0.10)] transition hover:-translate-y-0.5 hover:border-[#DC2626]/50 hover:shadow-[0_16px_36px_rgba(220,38,38,0.16)]">
            <h2 className="font-bold text-[#111111]">🗓️ ขอลา</h2>
            <p className="mt-1 text-sm text-[#555555]">ยื่นคำขอลาพักร้อน ลาป่วย ลากิจ</p>
          </Link>
          <Link to="/request/time-correction" className="rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_10px_28px_rgba(220,38,38,0.10)] transition hover:-translate-y-0.5 hover:border-[#DC2626]/50 hover:shadow-[0_16px_36px_rgba(220,38,38,0.16)]">
            <h2 className="font-bold text-[#111111]">⏱️ แก้ไขเวลา</h2>
            <p className="mt-1 text-sm text-[#555555]">แจ้งแก้ไขเวลาสแกนที่ผิดพลาด</p>
          </Link>
          <Link to="/request/ot" className="rounded-[1rem] border border-[#450A0A] bg-gradient-to-br from-[#450A0A] via-[#991B1B] to-[#DC2626] p-5 text-white shadow-[0_12px_32px_rgba(220,38,38,0.16)] transition hover:opacity-95">
            <h2 className="font-bold">⚡ ขอ OT</h2>
            <p className="mt-1 text-sm text-white/80">ยื่นคำขอทำงานล่วงเวลา</p>
          </Link>
        </div>

        <section className="space-y-3 rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_10px_28px_rgba(220,38,38,0.10)]">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <h3 className="text-lg font-bold text-[#DC2626]">ประวัติคำขอทั้งหมด</h3>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                value={type}
                onChange={(e) => { setType(e.target.value); loadHistory(e.target.value, status); }}
                className="rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-sm text-[#111111] focus:border-[#DC2626]"
              >
                <option value="all">ทุกประเภท</option>
                <option value="leave">ลา</option>
                <option value="time_correction">แก้ไขเวลา</option>
                <option value="ot">OT</option>
              </select>
              <select
                value={status}
                onChange={(e) => { setStatus(e.target.value); loadHistory(type, e.target.value); }}
                className="rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-sm text-[#111111] focus:border-[#DC2626]"
              >
                <option value="all">ทุกสถานะ</option>
                <option value="pending">รออนุมัติ</option>
                <option value="approved">อนุมัติแล้ว</option>
                <option value="rejected">ปฏิเสธ</option>
              </select>
            </div>
          </div>

          {error ? <p className="text-sm text-[#FCA5A5]">{error}</p> : null}
          {busy ? <p className="text-sm text-[#555555]">กำลังโหลด...</p> : null}

          {!busy && rows.length === 0 ? (
            <p className="text-sm text-[#555555]">ไม่มีข้อมูลคำขอ</p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={`${row.type}-${row.id}`} className="rounded-xl border border-[#FECACA] bg-white p-3">
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div className="text-sm text-[#444444]">
                      <p className="font-semibold text-[#111111]">{row.title}</p>
                      <p>{row.date_label}</p>
                      {row.amount_label ? <p>{row.amount_label}</p> : null}
                      {row.reason ? <p className="mt-1 text-xs text-[#555555]">{row.reason}</p> : null}
                    </div>
                    <div className="shrink-0">
                      {row.status_tag === "pending" && <span className="rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/10 px-2 py-1 text-xs text-[#B45309]">⏳ รออนุมัติ</span>}
                      {row.status_tag === "approved" && <span className="rounded-full border border-[#22C55E]/40 bg-[#22C55E]/10 px-2 py-1 text-xs text-[#15803D]">✅ อนุมัติแล้ว</span>}
                      {row.status_tag === "rejected" && <span className="rounded-full border border-[#EF4444]/40 bg-[#EF4444]/10 px-2 py-1 text-xs text-[#B91C1C]">❌ ปฏิเสธ</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="flex justify-center pt-2">
          <Link to="/dashboard" className="text-sm text-[#DC2626] transition hover:text-[#991B1B]">← กลับ Dashboard</Link>
        </div>
      </section>
    </main>
  );
}


