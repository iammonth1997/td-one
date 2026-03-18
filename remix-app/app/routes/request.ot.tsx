import { useState, useEffect, useMemo } from "react";
import { Link, redirect } from "react-router";
import type { Route } from "./+types/request.ot";
import { validateSession } from "~/lib/session-validation.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { session, error } = await validateSession(request, context);
  if (error || !session) throw redirect("/login");
  return { empId: session.emp_id };
}

function calcHours(start: string, end: string) {
  if (!start || !end) return { totalHours: 0, crossMidnight: false };
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let s = sh * 60 + sm;
  let e = eh * 60 + em;
  let crossMidnight = false;
  if (e < s) { e += 24 * 60; crossMidnight = true; }
  return { totalHours: Number(((e - s) / 60).toFixed(2)), crossMidnight };
}

type OtType = { code: string; name_th: string; name_en: string; rate_multiplier: number };
type OtRow = { id: number; date: string; start_time: string; end_time: string; total_hours: number; reason: string; ot_type: OtType | null };

export default function RequestOtPage(_props: Route.ComponentProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [otTypes, setOtTypes] = useState<OtType[]>([]);
  const [rows, setRows] = useState<OtRow[]>([]);
  const [limits, setLimits] = useState({ minHours: 1, maxHours: 4, maxPastDays: 7 });
  const [duplicateInfo, setDuplicateInfo] = useState({ has_ot: false, has_leave: false });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ ot_type_code: "normal", date: today, start_time: "18:00", end_time: "19:00", reason: "", project_ref: "" });

  const selectedType = useMemo(() => otTypes.find((x) => x.code === form.ot_type_code) ?? null, [otTypes, form.ot_type_code]);
  const calc = useMemo(() => calcHours(form.start_time, form.end_time), [form.start_time, form.end_time]);

  async function loadInit(date = form.date) {
    const [otRes, dupRes] = await Promise.all([
      fetch("/api/ot-request?limit=20"),
      fetch(`/api/ot-request/check-duplicate?date=${encodeURIComponent(date)}`),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const otJson: any = await otRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dupJson: any = await dupRes.json();
    if (!otRes.ok) throw new Error(otJson.error || "LOAD_FAILED");

    const mappedTypes: OtType[] = [];
    for (const row of (otJson.rows || [])) {
      if (row.ot_type && !mappedTypes.some((x) => x.code === row.ot_type.code)) mappedTypes.push(row.ot_type);
    }
    if (!mappedTypes.length) {
      mappedTypes.push(
        { code: "normal", name_th: "OT ปกติ", name_en: "Normal OT", rate_multiplier: 1.5 },
        { code: "holiday", name_th: "OT วันหยุด", name_en: "Holiday OT", rate_multiplier: 2.0 },
        { code: "special", name_th: "OT พิเศษ", name_en: "Special OT", rate_multiplier: 3.0 },
      );
    }
    setOtTypes(mappedTypes);
    setRows(otJson.rows || []);
    setLimits(otJson.limits || limits);
    setDuplicateInfo({ has_ot: Boolean(dupJson.has_ot), has_leave: Boolean(dupJson.has_leave) });
  }

  useEffect(() => { loadInit().catch((e) => setError(String(e.message || e))); }, []);

  const canSubmit = calc.totalHours >= limits.minHours && calc.totalHours <= limits.maxHours && form.reason.trim().length >= 20;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/ot-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      if (!res.ok) {
        if (data.error === "DUPLICATE_OT_REQUEST") setError("มีคำขอ OT วันนี้แล้ว");
        else if (data.error === "LEAVE_CONFLICT") setError("วันนั้นมีคำขอลาอยู่");
        else if (data.error === "REASON_TOO_SHORT") setError("กรุณาระบุเหตุผลอย่างน้อย 20 ตัวอักษร");
        else setError(data.error || "เกิดข้อผิดพลาด");
        return;
      }
      setSuccess("ยื่นคำขอ OT สำเร็จ");
      setForm((s) => ({ ...s, reason: "", project_ref: "" }));
      await loadInit();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-white px-4 py-6 text-[#111111] sm:px-6 sm:py-10">
      <section className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_12px_32px_rgba(220,38,38,0.12)]">
          <div>
            <h1 className="text-2xl font-bold text-[#111111]">⚡ ขอ OT</h1>
            <p className="mt-1 text-sm text-[#555555]">ยื่นคำขอทำงานล่วงเวลา</p>
          </div>
          <Link to="/request" className="text-sm text-[#DC2626] transition hover:text-[#991B1B]">← กลับ</Link>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_10px_28px_rgba(220,38,38,0.10)]">
          <h3 className="text-lg font-bold text-[#DC2626]">กรอกข้อมูล OT</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="text-sm font-semibold text-[#555555]">ประเภท OT</label>
              <select value={form.ot_type_code} onChange={(e) => setForm((s) => ({ ...s, ot_type_code: e.target.value }))} className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] focus:border-[#DC2626]">
                {otTypes.map((item) => (<option key={item.code} value={item.code}>{item.name_th} ({Number(item.rate_multiplier).toFixed(1)}x)</option>))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-[#555555]">วันที่</label>
              <input type="date" value={form.date} onChange={(e) => { setForm((s) => ({ ...s, date: e.target.value })); loadInit(e.target.value).catch(() => null); }} className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] focus:border-[#DC2626]" />
            </div>
            <div>
              <label className="text-sm font-semibold text-[#555555]">อัตราค่าแรง</label>
              <div className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#444444]">{selectedType ? `${Number(selectedType.rate_multiplier).toFixed(1)}x` : "-"}</div>
            </div>
            <div>
              <label className="text-sm font-semibold text-[#555555]">เวลาเริ่ม</label>
              <input type="time" value={form.start_time} onChange={(e) => setForm((s) => ({ ...s, start_time: e.target.value }))} className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] focus:border-[#DC2626]" />
            </div>
            <div>
              <label className="text-sm font-semibold text-[#555555]">เวลาสิ้นสุด</label>
              <input type="time" value={form.end_time} onChange={(e) => setForm((s) => ({ ...s, end_time: e.target.value }))} className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] focus:border-[#DC2626]" />
            </div>
            <div>
              <label className="text-sm font-semibold text-[#555555]">รวมชั่วโมง</label>
              <div className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#444444]">{calc.totalHours.toFixed(2)} ชม.{calc.crossMidnight ? " (ข้ามคืน)" : ""}</div>
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-[#555555]">เหตุผล (อย่างน้อย 20 ตัวอักษร)</label>
            <textarea value={form.reason} onChange={(e) => setForm((s) => ({ ...s, reason: e.target.value }))} className="mt-1 min-h-24 w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] focus:border-[#DC2626]" placeholder="ระบุเหตุผลการทำ OT อย่างละเอียด..." />
            <p className="mt-1 text-xs text-[#777]">{form.reason.trim().length}/20 ตัวอักษรขั้นต่ำ</p>
          </div>

          <div>
            <label className="text-sm font-semibold text-[#555555]">Project Ref (ไม่บังคับ)</label>
            <input value={form.project_ref} onChange={(e) => setForm((s) => ({ ...s, project_ref: e.target.value }))} className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] focus:border-[#DC2626]" />
          </div>

          {duplicateInfo.has_ot && <div className="rounded-xl border border-[#FCD34D] bg-[#FFF7ED] px-3 py-2 text-sm text-[#B45309]">⚠️ มีคำขอ OT ในวันที่เลือกแล้ว</div>}
          {duplicateInfo.has_leave && <div className="rounded-xl border border-[#FECACA] bg-[#FEF2F2] px-3 py-2 text-sm text-[#B91C1C]">❌ วันที่เลือกมีคำขอลาอยู่ ไม่สามารถยื่น OT ได้</div>}
          <p className="text-xs text-[#555555]">จำนวนชั่วโมง: {limits.minHours}–{limits.maxHours} ชม. | สามารถย้อนหลังได้สูงสุด {limits.maxPastDays} วัน</p>

          {error ? <div className="text-sm text-[#DC2626]">{error}</div> : null}
          {success ? <div className="text-sm text-[#15803D]">{success}</div> : null}

          <button disabled={busy || !canSubmit || duplicateInfo.has_leave} className="w-full rounded-xl bg-[#DC2626] px-6 py-2.5 font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.24)] transition hover:bg-[#991B1B] disabled:opacity-50 md:w-auto">{busy ? "กำลังดำเนินการ..." : "ยื่นคำขอ OT"}</button>
        </form>

        <section className="rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_10px_28px_rgba(220,38,38,0.10)]">
          <h3 className="mb-3 text-lg font-bold text-[#DC2626]">ประวัติคำขอ OT ของฉัน</h3>
          {rows.length === 0 ? <p className="text-sm text-[#555555]">ไม่มีข้อมูล</p> : (
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.id} className="rounded-xl border border-[#FECACA] bg-white p-3 text-sm">
                  <p className="font-semibold text-[#111111]">{row.ot_type?.name_th ?? "OT"} - {row.date}</p>
                  <p className="text-[#444444]">{row.start_time} – {row.end_time} ({row.total_hours} ชม.)</p>
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

