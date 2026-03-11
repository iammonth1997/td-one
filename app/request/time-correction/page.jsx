"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/app/hooks/useSession";
import { useLanguage } from "@/app/context/LanguageContext";

export default function RequestTimeCorrectionPage() {
  const router = useRouter();
  const { session, loading, getAuthHeaders } = useSession();
  const { t } = useLanguage();
  const L = t.request;

  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return {
      date: `${d.getFullYear()}-${m}-${day}`,
      correction_type: "forgot_in",
      requested_scan_in: "08:00",
      requested_scan_out: "17:00",
      reason: "",
    };
  });

  async function loadData() {
    const res = await fetch("/api/time-correction-request", { headers: getAuthHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "LOAD_FAILED");
    setRows(data.rows || []);
  }

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    loadData().catch((e) => setError(String(e.message || e)));
  }, [loading, session, router]);

  const needIn = form.correction_type === "forgot_in" || form.correction_type === "forgot_both";
  const needOut = form.correction_type === "forgot_out" || form.correction_type === "forgot_both";

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      const payload = {
        date: form.date,
        correction_type: form.correction_type,
        requested_scan_in: needIn ? form.requested_scan_in : null,
        requested_scan_out: needOut ? form.requested_scan_out : null,
        reason: form.reason,
      };

      const res = await fetch("/api/time-correction-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || L.errGeneral);
        return;
      }

      setSuccess(L.timeCorrectionSubmitSuccess);
      setForm((s) => ({ ...s, reason: "" }));
      await loadData();
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
            <h1 className="text-2xl font-bold text-[#1352A3]">{L.card2Title}</h1>
            <p className="text-sm text-[#6B7A99] mt-1">{L.card2Desc}</p>
          </div>
          <Link href="/request" className="text-sm text-[#1352A3] hover:underline">{L.backToRequest}</Link>
        </div>

        <form onSubmit={onSubmit} className="rounded-2xl border border-[#D0D8E4] bg-white p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-[#334260]">{L.dateLabel}</label>
              <input type="date" value={form.date} onChange={(e) => setForm((s) => ({ ...s, date: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2" />
            </div>

            <div>
              <label className="text-sm font-semibold text-[#334260]">{L.correctionTypeLabel}</label>
              <select value={form.correction_type} onChange={(e) => setForm((s) => ({ ...s, correction_type: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2">
                <option value="forgot_in">{L.correctionForgotIn}</option>
                <option value="forgot_out">{L.correctionForgotOut}</option>
                <option value="forgot_both">{L.correctionForgotBoth}</option>
              </select>
            </div>

            {needIn ? (
              <div>
                <label className="text-sm font-semibold text-[#334260]">{L.actualScanInLabel}</label>
                <input type="time" value={form.requested_scan_in} onChange={(e) => setForm((s) => ({ ...s, requested_scan_in: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2" />
              </div>
            ) : null}

            {needOut ? (
              <div>
                <label className="text-sm font-semibold text-[#334260]">{L.actualScanOutLabel}</label>
                <input type="time" value={form.requested_scan_out} onChange={(e) => setForm((s) => ({ ...s, requested_scan_out: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2" />
              </div>
            ) : null}
          </div>

          <div>
            <label className="text-sm font-semibold text-[#334260]">{L.reasonLabel}</label>
            <textarea value={form.reason} onChange={(e) => setForm((s) => ({ ...s, reason: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2 min-h-24" />
          </div>

          {error ? <div className="text-sm text-red-600">{error}</div> : null}
          {success ? <div className="text-sm text-green-600">{success}</div> : null}

          <button disabled={busy || !form.reason.trim()} className="w-full md:w-auto rounded-lg bg-[#1352A3] px-6 py-2.5 font-semibold text-white disabled:opacity-50">
            {busy ? L.submitLoading : L.submitBtn}
          </button>
        </form>

        <section className="rounded-2xl border border-[#D0D8E4] bg-white p-5">
          <h3 className="text-lg font-bold text-[#1A2B4A] mb-3">{L.timeCorrectionHistoryTitle}</h3>
          {!rows.length ? <p className="text-sm text-[#6B7A99]">{L.noData}</p> : (
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.id} className="rounded-lg border border-[#E1E7F0] p-3 text-sm">
                  <p className="font-semibold text-[#1A2B4A]">{row.date} - {row.correction_type}</p>
                  <p>{row.requested_scan_in || "-"} / {row.requested_scan_out || "-"}</p>
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
