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
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] text-[#1A2B4A]">
        <p>{L.loading}</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#F5F7FA] px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto max-w-6xl space-y-4">
        <div className="rounded-2xl border border-[#D0D8E4] bg-white p-5">
          <h1 className="text-2xl font-bold text-[#1352A3]">{L.title}</h1>
          <p className="text-sm text-[#6B7A99] mt-1">{L.subtitle}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link href="/request/leave" className="rounded-xl border border-[#D0D8E4] bg-white p-5 hover:border-[#1352A3] transition">
            <h2 className="font-bold text-[#1A2B4A]">{L.card1Title}</h2>
            <p className="text-sm text-[#6B7A99] mt-1">{L.card1Desc}</p>
          </Link>

          <Link href="/request/time-correction" className="rounded-xl border border-[#D0D8E4] bg-white p-5 hover:border-[#1352A3] transition">
            <h2 className="font-bold text-[#1A2B4A]">{L.card2Title}</h2>
            <p className="text-sm text-[#6B7A99] mt-1">{L.card2Desc}</p>
          </Link>

          <Link href="/request/ot" className="rounded-xl border border-[#0D3B7A] bg-gradient-to-br from-[#0D3B7A] to-[#1352A3] text-white p-5 hover:opacity-95 transition">
            <h2 className="font-bold">{L.card3Title}</h2>
            <p className="text-sm text-white/80 mt-1">{L.card3Desc}</p>
          </Link>
        </div>

        <section className="rounded-2xl border border-[#D0D8E4] bg-white p-5 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <h3 className="text-lg font-bold text-[#1A2B4A]">{L.historyTitle}</h3>
            <div className="flex flex-col sm:flex-row gap-2">
              <select
                value={type}
                onChange={(e) => {
                  const v = e.target.value;
                  setType(v);
                  loadHistory(v, status);
                }}
                className="rounded-lg border border-[#D0D8E4] px-3 py-2 text-sm"
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
                className="rounded-lg border border-[#D0D8E4] px-3 py-2 text-sm"
              >
                <option value="all">{L.filterAllStatus}</option>
                <option value="pending">{L.statusPending}</option>
                <option value="approved">{L.statusApproved}</option>
                <option value="rejected">{L.statusRejected}</option>
              </select>
            </div>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          {busy ? <p className="text-sm text-[#6B7A99]">{L.loading}</p> : null}

          {!busy && !rows.length ? (
            <p className="text-sm text-[#6B7A99]">{L.noData}</p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={`${row.type}-${row.id}`} className="rounded-lg border border-[#E1E7F0] p-3">
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2">
                    <div className="text-sm text-[#334260]">
                      <p className="font-semibold text-[#1A2B4A]">{row.title}</p>
                      <p>{row.date_label}</p>
                      <p>{row.amount_label}</p>
                      {row.reason ? <p className="text-xs text-[#6B7A99] mt-1">{row.reason}</p> : null}
                    </div>
                    <div>
                      {row.status_tag === "pending" ? <span className="text-xs rounded-full bg-amber-50 border border-amber-300 px-2 py-1 text-amber-700">{L.statusPendingIcon}</span> : null}
                      {row.status_tag === "approved" ? <span className="text-xs rounded-full bg-green-50 border border-green-300 px-2 py-1 text-green-700">{L.statusApprovedIcon}</span> : null}
                      {row.status_tag === "rejected" ? <span className="text-xs rounded-full bg-red-50 border border-red-300 px-2 py-1 text-red-700">{L.statusRejectedIcon}</span> : null}
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
