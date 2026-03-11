"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "@/app/hooks/useSession";
import { useLanguage } from "@/app/context/LanguageContext";
import { uploadFileToCloudinaryWithSignature } from "@/lib/cloudinaryUtils";

const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
const MAX_ATTACHMENT_MB = Math.round(MAX_ATTACHMENT_BYTES / (1024 * 1024));
const ALLOWED_ATTACHMENT_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const ALLOWED_ATTACHMENT_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

function isAllowedAttachmentFile(file) {
  if (!file) return true;
  const name = String(file.name || "").toLowerCase();
  const type = String(file.type || "").toLowerCase();
  const allowedByMime = ALLOWED_ATTACHMENT_MIME_TYPES.includes(type);
  const allowedByExt = ALLOWED_ATTACHMENT_EXTENSIONS.some((ext) => name.endsWith(ext));
  return allowedByMime && allowedByExt;
}

function calcLeaveDays(startDate, endDate) {
  if (!startDate || !endDate || startDate > endDate) return 0;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diff = (end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000);
  return Number((diff + 1).toFixed(1));
}

export default function RequestLeavePage() {
  const router = useRouter();
  const { session, loading, getAuthHeaders } = useSession();
  const { t, lang } = useLanguage();
  const L = t.request;

  const [leaveTypes, setLeaveTypes] = useState([]);
  const [balances, setBalances] = useState([]);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [form, setForm] = useState(() => {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    const today = `${d.getFullYear()}-${m}-${day}`;
    return {
      leave_type_code: "sick",
      start_date: today,
      end_date: today,
      reason: "",
      attachment_url: "",
      attachment_file: null,
    };
  });

  const totalDays = useMemo(() => calcLeaveDays(form.start_date, form.end_date), [form.start_date, form.end_date]);

  const selectedLeaveType = useMemo(
    () => leaveTypes.find((x) => x.code === form.leave_type_code) || null,
    [leaveTypes, form.leave_type_code]
  );

  const balance = useMemo(
    () => balances.find((x) => x.leave_type_code === form.leave_type_code) || null,
    [balances, form.leave_type_code]
  );

  const displayLeaveTypeName = (item) => {
    if (!item) return "-";
    if (lang === "lo") return item.name_lo;
    if (lang === "en") return item.name_en;
    return item.name_th;
  };

  async function loadData() {
    const res = await fetch("/api/leave-request", { headers: getAuthHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "LOAD_FAILED");
    setLeaveTypes(data.leave_types || []);
    setBalances(data.leave_balances || []);
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

  async function onSubmit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");

    try {
      let attachment = form.attachment_url || "";
      let attachmentPublicId = null;
      let attachmentResourceType = null;
      if (!attachment && form.attachment_file) {
        if (!isAllowedAttachmentFile(form.attachment_file)) {
          setError("อนุญาตเฉพาะไฟล์ JPG, PNG, WEBP หรือ PDF เท่านั้น");
          return;
        }

        if (Number(form.attachment_file.size || 0) > MAX_ATTACHMENT_BYTES) {
          setError(`ไฟล์แนบต้องมีขนาดไม่เกิน ${MAX_ATTACHMENT_MB}MB`);
          return;
        }

        setSuccess("กำลังอัปโหลดไฟล์แนบ...");
        const uploaded = await uploadFileToCloudinaryWithSignature(
          form.attachment_file,
          "tdone-attachments/leave",
          MAX_ATTACHMENT_BYTES,
          ALLOWED_ATTACHMENT_MIME_TYPES,
          ALLOWED_ATTACHMENT_EXTENSIONS
        );
        attachment = uploaded.secureUrl;
        attachmentPublicId = uploaded.publicId;
        attachmentResourceType = uploaded.resourceType;
      }

      const res = await fetch("/api/leave-request", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          leave_type_code: form.leave_type_code,
          start_date: form.start_date,
          end_date: form.end_date,
          reason: form.reason,
          attachment_url: attachment || null,
          attachment_public_id: attachmentPublicId,
          attachment_resource_type: attachmentResourceType,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        if (data.error === "INSUFFICIENT_LEAVE_BALANCE") {
          setError(L.leaveErrBalance.replace("{days}", String(data.remaining_days ?? 0)));
        } else {
          setError(data.error || L.errGeneral);
        }
        return;
      }

      setSuccess(L.leaveSubmitSuccess);
      setForm((s) => ({ ...s, reason: "", attachment_file: null, attachment_url: "" }));
      await loadData();
    } finally {
      setBusy(false);
    }
  }

  async function cancelLeaveRequest(requestId) {
    if (!requestId || busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`/api/leave-request/${requestId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({ action: "cancel" }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || L.errGeneral);
        return;
      }
      setSuccess(L.cancelSuccess || "ยกเลิกคำขอลาเรียบร้อย");
      await loadData();
    } finally {
      setBusy(false);
    }
  }

  if (loading || !session) return <div className="min-h-screen flex items-center justify-center">{L.loading}</div>;

  const totalBalance = balance?.total_days ?? selectedLeaveType?.max_days_per_year ?? 0;
  const usedBalance = balance?.used_days ?? 0;
  const remaining = selectedLeaveType?.max_days_per_year === null ? "-" : Math.max(totalBalance - usedBalance, 0);

  return (
    <main className="min-h-screen bg-[#F5F7FA] px-4 py-6 sm:px-6 sm:py-10">
      <section className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between rounded-2xl border border-[#D0D8E4] bg-white p-5">
          <div>
            <h1 className="text-2xl font-bold text-[#1352A3]">{L.card1Title}</h1>
            <p className="text-sm text-[#6B7A99] mt-1">{L.card1Desc}</p>
          </div>
          <Link href="/request" className="text-sm text-[#1352A3] hover:underline">{L.backToRequest}</Link>
        </div>

        <form onSubmit={onSubmit} className="rounded-2xl border border-[#D0D8E4] bg-white p-5 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-[#334260]">{L.leaveTypeLabel}</label>
              <select value={form.leave_type_code} onChange={(e) => setForm((s) => ({ ...s, leave_type_code: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2">
                {leaveTypes.map((item) => (
                  <option key={item.code} value={item.code}>{displayLeaveTypeName(item)}</option>
                ))}
              </select>
            </div>

            <div className="rounded-lg border border-[#D0D8E4] bg-[#F8FAFD] px-3 py-2 text-sm text-[#334260]">
              <p>{L.leaveRemaining}: <strong>{remaining}</strong></p>
              <p>{L.leaveUsed}: <strong>{usedBalance}</strong></p>
            </div>

            <div>
              <label className="text-sm font-semibold text-[#334260]">{L.startDateLabel}</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm((s) => ({ ...s, start_date: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2" />
            </div>

            <div>
              <label className="text-sm font-semibold text-[#334260]">{L.endDateLabel}</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm((s) => ({ ...s, end_date: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2" />
            </div>
          </div>

          <p className="text-sm text-[#334260]">{L.totalDaysLabel}: <strong>{totalDays}</strong></p>

          <div>
            <label className="text-sm font-semibold text-[#334260]">{L.reasonLabel}</label>
            <textarea value={form.reason} onChange={(e) => setForm((s) => ({ ...s, reason: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2 min-h-24" />
          </div>

          <div>
            <label className="text-sm font-semibold text-[#334260]">{L.attachmentLabel}</label>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                if (file && !isAllowedAttachmentFile(file)) {
                  setError("อนุญาตเฉพาะไฟล์ JPG, PNG, WEBP หรือ PDF เท่านั้น");
                  setForm((s) => ({ ...s, attachment_file: null }));
                  e.target.value = "";
                  return;
                }

                if (file && Number(file.size || 0) > MAX_ATTACHMENT_BYTES) {
                  setError(`ไฟล์แนบต้องมีขนาดไม่เกิน ${MAX_ATTACHMENT_MB}MB`);
                  setForm((s) => ({ ...s, attachment_file: null }));
                  e.target.value = "";
                  return;
                }
                setError("");
                setForm((s) => ({ ...s, attachment_file: file }));
              }}
              className="mt-1 w-full rounded-lg border border-[#D0D8E4] px-3 py-2"
            />
            <p className="mt-1 text-xs text-[#6B7A99]">รองรับเฉพาะ JPG, PNG, WEBP, PDF ขนาดไม่เกิน {MAX_ATTACHMENT_MB}MB</p>
          </div>

          {error ? <div className="text-sm text-red-600">{error}</div> : null}
          {success ? <div className="text-sm text-green-600">{success}</div> : null}

          <button disabled={busy || !totalDays} className="w-full md:w-auto rounded-lg bg-[#1352A3] px-6 py-2.5 font-semibold text-white disabled:opacity-50">
            {busy ? L.submitLoading : L.submitBtn}
          </button>
        </form>

        <section className="rounded-2xl border border-[#D0D8E4] bg-white p-5">
          <h3 className="text-lg font-bold text-[#1A2B4A] mb-3">{L.leaveHistoryTitle}</h3>
          {!rows.length ? <p className="text-sm text-[#6B7A99]">{L.noData}</p> : (
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.id} className="rounded-lg border border-[#E1E7F0] p-3 text-sm">
                  <p className="font-semibold text-[#1A2B4A]">{row.leave_type_code} ({row.start_date} - {row.end_date})</p>
                  <p>{row.total_days} {L.dayUnit}</p>
                  <p className="text-xs mt-1">Status: <span className="font-semibold">{row.status}</span></p>
                  <p className="text-xs text-[#6B7A99] mt-1">{row.reason || "-"}</p>
                  {(row.status === "pending" || row.status === "approved") ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => cancelLeaveRequest(row.id)}
                      className="mt-2 rounded-md border border-[#D0D8E4] px-3 py-1.5 text-xs text-[#334260] hover:bg-[#F8FAFD] disabled:opacity-50"
                    >
                      {L.cancelBtn || "Cancel"}
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </section>
    </main>
  );
}
