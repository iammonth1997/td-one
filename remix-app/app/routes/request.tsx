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

  function detailLink(row: HistoryRow) {
    if (row.type === "leave") return `/request/leave?id=${row.id}`;
    if (row.type === "ot") return `/request/ot?id=${row.id}`;
    if (row.type === "time_correction") return `/request/time-correction?id=${row.id}`;
    return "/request";
  }

  return (
    <main className="min-h-screen bg-[#F4F4F6] px-4 pb-24 pt-5 text-[#111111]">
      <section className="mx-auto max-w-md space-y-4">
        <div className="rounded-2xl border border-black/[0.07] bg-white p-4">
          <h1 className="text-lg font-bold text-[#0D0D0D]">คำขอของฉัน</h1>
          <p className="mt-1 text-xs text-[#9898AA]">ยื่นคำขอและติดตามสถานะได้ในที่เดียว</p>
        </div>

        <div className="grid grid-cols-1 gap-2.5">
          <Link
            to="/request/leave"
            className="rounded-2xl border border-black/[0.07] bg-white p-4 transition active:scale-[0.98] [-webkit-tap-highlight-color:transparent]"
          >
            <div className="mb-2 flex size-11 items-center justify-center rounded-[13px] bg-[#F5F3FF] text-[#8B5CF6]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <rect x="3" y="4" width="18" height="18" rx="2" />
                <path d="M16 2v4M8 2v4M3 10h18" />
                <path d="M8 14h.01M12 14h.01" />
              </svg>
            </div>
            <p className="text-[13px] font-bold text-[#0D0D0D]">ลาพักร้อน/ป่วย/กิจ</p>
            <p className="mt-0.5 text-[11px] text-[#9898AA]">ยื่นคำขอลาและแนบเอกสาร</p>
          </Link>
          <Link
            to="/request/ot"
            className="rounded-2xl border border-black/[0.07] bg-white p-4 transition active:scale-[0.98] [-webkit-tap-highlight-color:transparent]"
          >
            <div className="mb-2 flex size-11 items-center justify-center rounded-[13px] bg-[#FFF0F3] text-[#D0002A]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M13 2L3 14h7l-1 8 10-12h-7z" />
              </svg>
            </div>
            <p className="text-[13px] font-bold text-[#0D0D0D]">ขอ OT</p>
            <p className="mt-0.5 text-[11px] text-[#9898AA]">ยื่นคำขอทำงานล่วงเวลา</p>
          </Link>
          <Link
            to="/request/time-correction"
            className="rounded-2xl border border-black/[0.07] bg-white p-4 transition active:scale-[0.98] [-webkit-tap-highlight-color:transparent]"
          >
            <div className="mb-2 flex size-11 items-center justify-center rounded-[13px] bg-[#EFF6FF] text-[#3B82F6]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <p className="text-[13px] font-bold text-[#0D0D0D]">แก้ไขเวลา</p>
            <p className="mt-0.5 text-[11px] text-[#9898AA]">แจ้งแก้ไขเวลาสแกนที่ผิดพลาด</p>
          </Link>
        </div>

        <section className="space-y-3 rounded-2xl border border-black/[0.07] bg-white p-4">
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-bold text-[#0D0D0D]">รายการคำขอ</h3>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={type}
                onChange={(e) => { setType(e.target.value); loadHistory(e.target.value, status); }}
                className="rounded-xl border border-black/[0.07] bg-white px-3 py-2 text-xs text-[#111111]"
              >
                <option value="all">ทุกประเภท</option>
                <option value="leave">ลา</option>
                <option value="time_correction">แก้ไขเวลา</option>
                <option value="ot">OT</option>
              </select>
              <select
                value={status}
                onChange={(e) => { setStatus(e.target.value); loadHistory(type, e.target.value); }}
                className="rounded-xl border border-black/[0.07] bg-white px-3 py-2 text-xs text-[#111111]"
              >
                <option value="all">ทุกสถานะ</option>
                <option value="pending">รออนุมัติ</option>
                <option value="approved">อนุมัติแล้ว</option>
                <option value="rejected">ปฏิเสธ</option>
              </select>
            </div>
          </div>

          {error ? <p className="text-sm text-[#D0002A]">{error}</p> : null}
          {busy ? <p className="text-sm text-[#9898AA]">กำลังโหลด...</p> : null}

          {!busy && rows.length === 0 ? (
            <p className="text-sm text-[#9898AA]">ไม่มีข้อมูลคำขอ</p>
          ) : (
            <div className="space-y-2.5">
              {rows.map((row) => (
                <div key={`${row.type}-${row.id}`} className="rounded-2xl border border-black/[0.07] bg-white p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold text-[#0D0D0D]">{row.title || row.type}</p>
                      {row.reason ? <p className="mt-1 text-[12px] leading-relaxed text-[#5A5A6B]">{row.reason}</p> : null}
                      <p className="mt-2 text-[11px] text-[#9898AA]">วันที่ยื่น: {row.date_label}</p>
                      {row.amount_label ? <p className="text-[11px] text-[#9898AA]">{row.amount_label}</p> : null}
                      <Link to={detailLink(row)} className="mt-2 inline-block text-[11px] font-semibold text-[#D0002A]">
                        ดูรายละเอียด →
                      </Link>
                    </div>
                    <div className="shrink-0">
                      {row.status_tag === "pending" && (
                        <span className="rounded-full bg-[#FFFBEB] px-2.5 py-1 text-[10px] font-bold text-[#F59E0B]">
                          รอดำเนินการ
                        </span>
                      )}
                      {row.status_tag === "approved" && (
                        <span className="rounded-full bg-[#EDFBF4] px-2.5 py-1 text-[10px] font-bold text-[#00B96B]">
                          อนุมัติแล้ว
                        </span>
                      )}
                      {row.status_tag === "rejected" && (
                        <span className="rounded-full bg-[#FFF0F3] px-2.5 py-1 text-[10px] font-bold text-[#D0002A]">
                          ไม่อนุมัติ
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="flex justify-center pt-1">
          <Link to="/dashboard" className="text-sm text-[#D0002A]">← กลับ Dashboard</Link>
        </div>
      </section>
      <Link
        to="/request/leave"
        className="fixed bottom-[calc(80px+env(safe-area-inset-bottom)+16px)] right-[max(16px,calc(50%-215px+16px))] z-[90] flex size-[54px] items-center justify-center rounded-2xl bg-gradient-to-br from-[#B00030] to-[#E8193A] text-white shadow-[0_6px_20px_rgba(176,0,48,0.35)] transition active:scale-95"
        aria-label="สร้างคำขอใหม่"
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </Link>
    </main>
  );
}


