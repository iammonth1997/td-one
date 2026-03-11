"use client";

import { useEffect, useMemo, useState } from "react";
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

  const totalHours = Number(((endMinutes - startMinutes) / 60).toFixed(2));
  return { totalHours, crossMidnight };
}

export default function RequestPage() {
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
    setError("");

    const [otRes, typeRes] = await Promise.all([
      fetch("/api/ot-request?limit=20", { headers: getAuthHeaders() }),
      fetch("/api/ot-request/check-duplicate?date=" + encodeURIComponent(form.date), { headers: getAuthHeaders() }),
    ]);

    const otJson = await otRes.json();
    const typeJson = await typeRes.json();

    if (!otRes.ok) {
      throw new Error(otJson.error || "LOAD_FAILED");
    }
    if (!typeRes.ok) {
      throw new Error(typeJson.error || "LOAD_DUPLICATE_FAILED");
    }

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
    setDuplicateInfo({ has_ot: Boolean(typeJson.has_ot), has_leave: Boolean(typeJson.has_leave) });
  }

  async function refreshDuplicate(dateValue) {
    const res = await fetch(`/api/ot-request/check-duplicate?date=${encodeURIComponent(dateValue)}`, {
      headers: getAuthHeaders(),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "CHECK_DUPLICATE_FAILED");
    }
    setDuplicateInfo({ has_ot: Boolean(data.has_ot), has_leave: Boolean(data.has_leave) });
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
    if (busy) return;

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
        else if (data.error === "FUTURE_DATE_NOT_ALLOWED") setError(L.errFutureDate);
        else if (data.error === "DATE_TOO_OLD") setError(L.errDateTooOld.replace("{days}", String(limits.maxPastDays)));
        else if (data.error === "INVALID_OT_HOURS") setError(L.errHoursLimit.replace("{min}", String(limits.minHours)).replace("{max}", String(limits.maxHours)));
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

  async function cancelRequest(id) {
    setError("");
    setSuccess("");

    const res = await fetch(`/api/ot-request/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify({ action: "cancel" }),
    });

    const data = await res.json();
    if (!res.ok) {
      setError(data.error || L.errGeneral);
      return;
    }

    setSuccess(L.cancelSuccess);
    await loadInit();
  }

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] text-[#1A2B4A]">
        <p>{L.loading}</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#F5F7FA] px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto w-full max-w-5xl space-y-4">
        <div className="rounded-2xl border border-[#D0D8E4] bg-white p-5 shadow-[0_4px_24px_rgba(13,59,122,0.08)]">
          <h1 className="text-2xl font-bold text-[#1352A3]">{L.title}</h1>
          <p className="text-sm text-[#6B7A99] mt-1">{L.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl border border-[#D0D8E4] bg-white p-4">
            <h2 className="font-bold text-[#1A2B4A]">{L.card1Title}</h2>
            <p className="text-sm text-[#6B7A99] mt-1">{L.cardComingSoon}</p>
          </div>
          <div className="rounded-xl border border-[#D0D8E4] bg-white p-4">
            <h2 className="font-bold text-[#1A2B4A]">{L.card2Title}</h2>
            <p className="text-sm text-[#6B7A99] mt-1">{L.cardComingSoon}</p>
          </div>
          <div className="rounded-xl border border-[#0D3B7A] bg-gradient-to-br from-[#0D3B7A] to-[#1352A3] text-white p-4">
            <h2 className="font-bold">{L.card3Title}</h2>
            <p className="text-sm text-white/80 mt-1">{L.card3Desc}</p>
          </div>
        </div>

        <form onSubmit={onSubmit} className="rounded-2xl border border-[#D0D8E4] bg-white p-5 space-y-4">
          <h3 className="text-lg font-bold text-[#1A2B4A]">{L.formTitle}</h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="text-sm font-semibold text-[#334260]">{L.otTypeLabel}</label>
              <select
                value={form.ot_type_code}
                onChange={(e) => setForm((s) => ({ ...s, ot_type_code: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2"
              >
                {otTypes.map((item) => (
                  <option key={item.code} value={item.code}>
                    {displayTypeName(item)} ({Number(item.rate_multiplier).toFixed(1)}x)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-semibold text-[#334260]">{L.dateLabel}</label>
              <input
                type="date"
                value={form.date}
                onChange={async (e) => {
                  const v = e.target.value;
                  setForm((s) => ({ ...s, date: v }));
                  try {
                    await refreshDuplicate(v);
                  } catch (err) {
                    setError(String(err.message || err));
                  }
                }}
                className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-[#334260]">{L.rateLabel}</label>
              <div className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2 bg-[#F8FAFD] text-[#1A2B4A]">
                {selectedType ? `${Number(selectedType.rate_multiplier).toFixed(1)}x` : "-"}
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold text-[#334260]">{L.startTimeLabel}</label>
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => setForm((s) => ({ ...s, start_time: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-[#334260]">{L.endTimeLabel}</label>
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => setForm((s) => ({ ...s, end_time: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-[#334260]">{L.totalHoursLabel}</label>
              <div className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2 bg-[#F8FAFD] text-[#1A2B4A]">
                {calc.totalHours.toFixed(2)} {L.hourUnit}
                {calc.crossMidnight ? ` (${L.nextDay})` : ""}
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-[#334260]">{L.reasonLabel}</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm((s) => ({ ...s, reason: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2 min-h-28"
              placeholder={L.reasonPlaceholder}
            />
            <p className="text-xs text-[#6B7A99] mt-1">{L.reasonHint}</p>
          </div>

          <div>
            <label className="text-sm font-semibold text-[#334260]">{L.projectRefLabel}</label>
            <input
              value={form.project_ref}
              onChange={(e) => setForm((s) => ({ ...s, project_ref: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2"
              placeholder={L.projectRefPlaceholder}
            />
          </div>

          {duplicateInfo.has_ot ? (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {L.warningDuplicate}
            </div>
          ) : null}

          {duplicateInfo.has_leave ? (
            <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
              {L.warningLeave}
            </div>
          ) : null}

          <p className="text-xs text-[#6B7A99]">
            {L.limitHint.replace("{min}", String(limits.minHours)).replace("{max}", String(limits.maxHours)).replace("{days}", String(limits.maxPastDays))}
          </p>

          {error ? <div className="text-sm text-red-600">{error}</div> : null}
          {success ? <div className="text-sm text-green-600">{success}</div> : null}

          <button
            disabled={busy || !canSubmit || duplicateInfo.has_leave}
            className="w-full md:w-auto rounded-lg bg-[#1352A3] px-6 py-2.5 font-semibold text-white disabled:opacity-50"
          >
            {busy ? L.submitLoading : L.submitBtn}
          </button>
        </form>

        <section className="rounded-2xl border border-[#D0D8E4] bg-white p-5">
          <h3 className="text-lg font-bold text-[#1A2B4A] mb-3">{L.myRequestsTitle}</h3>

          {!rows.length ? (
            <p className="text-sm text-[#6B7A99]">{L.noData}</p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.id} className="rounded-lg border border-[#E1E7F0] p-3">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="text-sm text-[#334260]">
                      <p className="font-semibold text-[#1A2B4A]">{displayTypeName(row.ot_type)} - {row.date}</p>
                      <p>{row.start_time} - {row.end_time} ({row.total_hours} {L.hourUnit}){row.cross_midnight ? `, ${L.nextDay}` : ""}</p>
                      <p className="text-xs text-[#6B7A99] mt-1">{row.reason}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs rounded-full bg-[#E8F0FB] px-2 py-1 text-[#1352A3]">{row.status}</span>
                      {row.status === "pending" ? (
                        <button
                          type="button"
                          onClick={() => cancelRequest(row.id)}
                          className="text-xs rounded border border-red-300 px-2 py-1 text-red-600"
                        >
                          {L.cancelBtn}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
