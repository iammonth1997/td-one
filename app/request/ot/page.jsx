"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLanguage } from "@/app/context/LanguageContext";
import { useSession } from "@/app/hooks/useSession";

function calculateHours(startTime, endTime) {
  if (!startTime || !endTime || startTime === endTime) {
    return { totalHours: 0, crossMidnight: false };
  }
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  let startMinutes = sh * 60 + sm;
  let endMinutes = eh * 60 + em;
  let crossMidnight = false;
  if (endMinutes < startMinutes) {
    endMinutes += 24 * 60;
    crossMidnight = true;
  }
  return { totalHours: Number(((endMinutes - startMinutes) / 60).toFixed(2)), crossMidnight };
}

export default function RequestOtPage() {
  const router = useRouter();
  const { t, lang } = useLanguage();
  const { session, loading, getAuthHeaders } = useSession();
  const L = t.request;

  const [otTypes, setOtTypes] = useState([]);
  const [rows, setRows] = useState([]);
  const [limits, setLimits] = useState({ minHours: 1, maxHours: 4, maxPastDays: 7 });
  const [duplicateInfo, setDuplicateInfo] = useState({ has_ot: false, has_leave: false });
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);

  const [form, setForm] = useState(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return {
      ot_type_code: "normal",
      date: `${d.getFullYear()}-${m}-${day}`,
      start_time: "18:00",
      end_time: "19:00",
      reason: "",
      project_ref: "",
    };
  });

  const selectedType = useMemo(() => otTypes.find((x) => x.code === form.ot_type_code) || null, [otTypes, form.ot_type_code]);
  const calc = useMemo(() => calculateHours(form.start_time, form.end_time), [form.start_time, form.end_time]);

  const displayTypeName = (item) => {
    if (!item) return "-";
    if (lang === "lo") return item.name_lo;
    if (lang === "en") return item.name_en;
    return item.name_th;
  };

  async function loadInit() {
    const [otRes, dupRes] = await Promise.all([
      fetch("/api/ot-request?limit=20", { headers: getAuthHeaders() }),
      fetch(`/api/ot-request/check-duplicate?date=${encodeURIComponent(form.date)}`, { headers: getAuthHeaders() }),
    ]);
    const otJson = await otRes.json();
    const dupJson = await dupRes.json();

    if (!otRes.ok) throw new Error(otJson.error || "LOAD_FAILED");
    if (!dupRes.ok) throw new Error(dupJson.error || "LOAD_DUPLICATE_FAILED");

    const mappedTypes = [];
    for (const row of otJson.rows || []) {
      if (row.ot_type && !mappedTypes.some((x) => x.code === row.ot_type.code)) {
        mappedTypes.push(row.ot_type);
      }
    }
    if (!mappedTypes.length) {
      mappedTypes.push(
        { code: "normal", name_lo: "OT ປົກກະຕິ", name_th: "OT ปกติ", name_en: "Normal OT", rate_multiplier: 1.5 },
        { code: "holiday", name_lo: "OT ວັນພັກ", name_th: "OT วันหยุด", name_en: "Holiday OT", rate_multiplier: 2.0 },
        { code: "special", name_lo: "OT ພິເສດ", name_th: "OT พิเศษ", name_en: "Special OT", rate_multiplier: 3.0 }
      );
    }

    setOtTypes(mappedTypes);
    setRows(otJson.rows || []);
    setLimits(otJson.limits || limits);
    setDuplicateInfo({ has_ot: Boolean(dupJson.has_ot), has_leave: Boolean(dupJson.has_leave) });
  }

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    loadInit().catch((e) => setError(String(e.message || e)));
  }, [loading, session, router]);

  const canSubmit = calc.totalHours >= limits.minHours && calc.totalHours <= limits.maxHours && form.reason.trim().length >= 20;

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/ot-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "DUPLICATE_OT_REQUEST") setError(L.errDuplicate);
        else if (data.error === "LEAVE_CONFLICT") setError(L.errLeaveConflict);
        else if (data.error === "REASON_TOO_SHORT") setError(L.errReasonTooShort);
        else setError(data.error || L.errGeneral);
        return;
      }
      setSuccess(L.submitSuccess);
      setForm((s) => ({ ...s, reason: "", project_ref: "" }));
      await loadInit();
    } finally {
      setBusy(false);
    }
  }

  if (loading || !session) return <div className="min-h-screen flex items-center justify-center">{L.loading}</div>;

  return (
    <main className="min-h-screen bg-[#F5F7FA] px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between rounded-2xl border border-[#D0D8E4] bg-white p-5">
          <div>
            <h1 className="text-2xl font-bold text-[#1352A3]">{L.card3Title}</h1>
            <p className="text-sm text-[#6B7A99] mt-1">{L.card3Desc}</p>
          </div>
          <Link href="/request" className="text-sm text-[#1352A3] hover:underline">{L.backToRequest}</Link>
        </div>

        <form onSubmit={onSubmit} className="rounded-2xl border border-[#D0D8E4] bg-white p-5 space-y-4">
          <h3 className="text-lg font-bold text-[#1A2B4A]">{L.formTitle}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-semibold text-[#334260]">{L.otTypeLabel}</label>
              <select value={form.ot_type_code} onChange={(e) => setForm((s) => ({ ...s, ot_type_code: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2">
                {otTypes.map((item) => (
                  <option key={item.code} value={item.code}>{displayTypeName(item)} ({Number(item.rate_multiplier).toFixed(1)}x)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-[#334260]">{L.dateLabel}</label>
              <input type="date" value={form.date} onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2" />
            </div>
            <div>
              <label className="text-sm font-semibold text-[#334260]">{L.rateLabel}</label>
              <div className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2 bg-[#F8FAFD]">{selectedType ? `${Number(selectedType.rate_multiplier).toFixed(1)}x` : "-"}</div>
            </div>
            <div>
              <label className="text-sm font-semibold text-[#334260]">{L.startTimeLabel}</label>
              <input type="time" value={form.start_time} onChange={(e) => setForm((s) => ({ ...s, start_time: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2" />
            </div>
            <div>
              <label className="text-sm font-semibold text-[#334260]">{L.endTimeLabel}</label>
              <input type="time" value={form.end_time} onChange={(e) => setForm((s) => ({ ...s, end_time: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2" />
            </div>
            <div>
              <label className="text-sm font-semibold text-[#334260]">{L.totalHoursLabel}</label>
              <div className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2 bg-[#F8FAFD]">{calc.totalHours.toFixed(2)} {L.hourUnit}{calc.crossMidnight ? ` (${L.nextDay})` : ""}</div>
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-[#334260]">{L.reasonLabel}</label>
            <textarea value={form.reason} onChange={(e) => setForm((s) => ({ ...s, reason: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2 min-h-24" placeholder={L.reasonPlaceholder} />
          </div>

          <div>
            <label className="text-sm font-semibold text-[#334260]">{L.projectRefLabel}</label>
            <input value={form.project_ref} onChange={(e) => setForm((s) => ({ ...s, project_ref: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2" placeholder={L.projectRefPlaceholder} />
          </div>

          {duplicateInfo.has_ot ? <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">{L.warningDuplicate}</div> : null}
          {duplicateInfo.has_leave ? <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{L.warningLeave}</div> : null}
          <p className="text-xs text-[#6B7A99]">{L.limitHint.replace("{min}", String(limits.minHours)).replace("{max}", String(limits.maxHours)).replace("{days}", String(limits.maxPastDays))}</p>

          {error ? <div className="text-sm text-red-600">{error}</div> : null}
          {success ? <div className="text-sm text-green-600">{success}</div> : null}

          <button disabled={busy || !canSubmit || duplicateInfo.has_leave} className="w-full md:w-auto rounded-lg bg-[#1352A3] px-6 py-2.5 font-semibold text-white disabled:opacity-50">{busy ? L.submitLoading : L.submitBtn}</button>
        </form>

        <section className="rounded-2xl border border-[#D0D8E4] bg-white p-5">
          <h3 className="text-lg font-bold text-[#1A2B4A] mb-3">{L.myRequestsTitle}</h3>
          {!rows.length ? <p className="text-sm text-[#6B7A99]">{L.noData}</p> : (
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.id} className="rounded-lg border border-[#E1E7F0] p-3 text-sm">
                  <p className="font-semibold text-[#1A2B4A]">{displayTypeName(row.ot_type)} - {row.date}</p>
                  <p>{row.start_time} - {row.end_time} ({row.total_hours} {L.hourUnit})</p>
                  <p className="text-xs text-[#6B7A99] mt-1">{row.reason}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
