"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/app/hooks/useSession";
import { useLanguage } from "@/app/context/LanguageContext";

export default function RequestHomePage() {
  const router = useRouter();
  const { session, loading, getAuthHeaders } = useSession();
  const { t } = useLanguage();
  const L = t.request;

  const [rows, setRows] = useState([]);
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function loadHistory(nextType = type, nextStatus = status) {
    setBusy(true);
    setError("");

    try {
      const qs = new URLSearchParams({ type: nextType, status: nextStatus });
      const res = await fetch(`/api/request-history?${qs.toString()}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "LOAD_HISTORY_FAILED");
      setRows(data.rows || []);
    } catch (e) {
      setError(String(e.message || e));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (loading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    loadHistory("all", "all");
  }, [loading, session, router]);

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-[#555555]">
        <p>{L.loading}</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-white px-4 py-6 text-[#111111] sm:px-6 sm:py-10">
      <section className="mx-auto max-w-6xl space-y-4">
        <div className="rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_12px_32px_rgba(220,38,38,0.12)]">
          <h1 className="text-2xl font-bold text-[#111111]">{L.title}</h1>
          <p className="mt-1 text-sm text-[#555555]">{L.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/request/leave" className="rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_10px_28px_rgba(220,38,38,0.10)] transition hover:-translate-y-0.5 hover:border-[#DC2626]/50 hover:shadow-[0_16px_36px_rgba(220,38,38,0.16)]">
            <h2 className="font-bold text-[#111111]">{L.card1Title}</h2>
            <p className="mt-1 text-sm text-[#555555]">{L.card1Desc}</p>
          </Link>

          <Link href="/request/time-correction" className="rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_10px_28px_rgba(220,38,38,0.10)] transition hover:-translate-y-0.5 hover:border-[#DC2626]/50 hover:shadow-[0_16px_36px_rgba(220,38,38,0.16)]">
            <h2 className="font-bold text-[#111111]">{L.card2Title}</h2>
            <p className="mt-1 text-sm text-[#555555]">{L.card2Desc}</p>
          </Link>

          <Link href="/request/ot" className="rounded-[1rem] border border-[#450A0A] bg-gradient-to-br from-[#450A0A] via-[#991B1B] to-[#DC2626] p-5 text-white shadow-[0_12px_32px_rgba(220,38,38,0.16)] transition hover:opacity-95">
            <h2 className="font-bold">{L.card3Title}</h2>
            <p className="text-sm text-white/80 mt-1">{L.card3Desc}</p>
          </Link>
        </div>

        <section className="space-y-3 rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_10px_28px_rgba(220,38,38,0.10)]">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <h3 className="text-lg font-bold text-[#DC2626]">{L.historyTitle}</h3>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={type}
                onChange={(e) => {
                  const v = e.target.value;
                  setType(v);
                  loadHistory(v, status);
                }}
                className="rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-sm text-[#111111] focus:border-[#DC2626]"
              >
                <option value="all">{L.filterAllType}</option>
                <option value="leave">{L.filterLeave}</option>
                <option value="time_correction">{L.filterTimeCorrection}</option>
                <option value="ot">{L.filterOt}</option>
              </select>

              <select
                value={status}
                onChange={(e) => {
                  const v = e.target.value;
                  setStatus(v);
                  loadHistory(type, v);
                }}
                className="rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-sm text-[#111111] focus:border-[#DC2626]"
              >
                <option value="all">{L.filterAllStatus}</option>
                <option value="pending">{L.statusPending}</option>
                <option value="approved">{L.statusApproved}</option>
                <option value="rejected">{L.statusRejected}</option>
              </select>
            </div>
          </div>

          {error ? <p className="text-sm text-[#FCA5A5]">{error}</p> : null}
          {busy ? <p className="text-sm text-[#555555]">{L.loading}</p> : null}

          {!busy && !rows.length ? (
            <p className="text-sm text-[#555555]">{L.noData}</p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={`${row.type}-${row.id}`} className="rounded-xl border border-[#FECACA] bg-white p-3">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="text-sm text-[#444444]">
                      <p className="font-semibold text-[#111111]">{row.title}</p>
                      <p>{row.date_label}</p>
                      <p>{row.amount_label}</p>
                      {row.reason ? <p className="mt-1 text-xs text-[#555555]">{row.reason}</p> : null}
                    </div>
                    <div>
                      {row.status_tag === "pending" ? <span className="rounded-full border border-[#F59E0B]/40 bg-[#F59E0B]/20 px-2 py-1 text-xs text-[#FCD34D]">{L.statusPendingIcon}</span> : null}
                      {row.status_tag === "approved" ? <span className="rounded-full border border-[#22C55E]/40 bg-[#22C55E]/20 px-2 py-1 text-xs text-[#86EFAC]">{L.statusApprovedIcon}</span> : null}
                      {row.status_tag === "rejected" ? <span className="rounded-full border border-[#EF4444]/40 bg-[#EF4444]/20 px-2 py-1 text-xs text-[#FCA5A5]">{L.statusRejectedIcon}</span> : null}
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
