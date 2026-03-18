import { useState, useEffect, useMemo } from "react";
import { Link, redirect } from "react-router";
import type { Route } from "./+types/request.leave";
import { validateSession } from "~/lib/session-validation.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { session, error } = await validateSession(request, context);
  if (error || !session) throw redirect("/login");
  return { empId: session.emp_id };
}

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const ALLOWED_EXT = [".jpg", ".jpeg", ".png", ".webp", ".pdf"];

function isAllowedFile(file: File) {
  const name = file.name.toLowerCase();
  return ALLOWED_MIME.includes(file.type) && ALLOWED_EXT.some((e) => name.endsWith(e));
}

function calcLeaveDays(start: string, end: string) {
  if (!start || !end || start > end) return 0;
  const diff = (new Date(end).getTime() - new Date(start).getTime()) / 86400000;
  return Number((diff + 1).toFixed(1));
}

async function uploadToCloudinary(file: File, folder: string) {
  const signRes = await fetch("/api/cloudinary/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sign: any = await signRes.json();
  if (!signRes.ok) throw new Error(sign.error || "SIGN_FAILED");

  const resourceType = file.type === "application/pdf" ? "raw" : "image";
  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", folder);
  fd.append("timestamp", String(sign.timestamp));
  fd.append("signature", sign.signature);
  fd.append("api_key", sign.apiKey);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloudName}/${resourceType}/upload`, { method: "POST", body: fd });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data: any = await res.json();
  if (!res.ok) throw new Error(data.error?.message || "UPLOAD_FAILED");
  return { secureUrl: data.secure_url as string, publicId: data.public_id as string, resourceType: data.resource_type as string };
}

type LeaveType = { code: string; name_th: string; name_en: string; max_days_per_year: number | null };
type LeaveBalance = { leave_type_code: string; total_days: number; used_days: number };
type LeaveRow = { id: number; leave_type_code: string; start_date: string; end_date: string; total_days: number; reason: string; status: string };

export default function RequestLeavePage(_props: Route.ComponentProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [balances, setBalances] = useState<LeaveBalance[]>([]);
  const [rows, setRows] = useState<LeaveRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [form, setForm] = useState({ leave_type_code: "sick", start_date: today, end_date: today, reason: "", attachment_file: null as File | null });

  const totalDays = useMemo(() => calcLeaveDays(form.start_date, form.end_date), [form.start_date, form.end_date]);
  const balance = useMemo(() => balances.find((x) => x.leave_type_code === form.leave_type_code) || null, [balances, form.leave_type_code]);
  const selectedType = useMemo(() => leaveTypes.find((x) => x.code === form.leave_type_code) || null, [leaveTypes, form.leave_type_code]);

  async function loadData() {
    const res = await fetch("/api/leave-request");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error || "LOAD_FAILED");
    setLeaveTypes(data.leave_types || []);
    setBalances(data.leave_balances || []);
    setRows(data.rows || []);
  }

  useEffect(() => { loadData().catch((e) => setError(String(e.message || e))); }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!totalDays) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      let attachment_url: string | null = null;
      let attachment_public_id: string | null = null;
      let attachment_resource_type: string | null = null;

      if (form.attachment_file) {
        setSuccess("กำลังอัปโหลดไฟล์...");
        const uploaded = await uploadToCloudinary(form.attachment_file, "tdone-attachments/leave");
        attachment_url = uploaded.secureUrl;
        attachment_public_id = uploaded.publicId;
        attachment_resource_type = uploaded.resourceType;
      }

      const res = await fetch("/api/leave-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leave_type_code: form.leave_type_code, start_date: form.start_date, end_date: form.end_date, reason: form.reason, attachment_url, attachment_public_id, attachment_resource_type }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      if (!res.ok) {
        if (data.error === "INSUFFICIENT_LEAVE_BALANCE") setError(`วันลาคงเหลือไม่พอ (เหลือ ${data.remaining_days ?? 0} วัน)`);
        else setError(data.error || "เกิดข้อผิดพลาด");
        return;
      }
      setSuccess("ยื่นคำขอลาสำเร็จ");
      setForm((s) => ({ ...s, reason: "", attachment_file: null }));
      await loadData();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function cancelRequest(id: number) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/leave-request/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel" }),
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      if (!res.ok) { setError(data.error || "เกิดข้อผิดพลาด"); return; }
      setSuccess("ยกเลิกคำขอลาสำเร็จ");
      await loadData();
    } finally {
      setBusy(false);
    }
  }

  const remaining = selectedType?.max_days_per_year == null ? "-" : Math.max((balance?.total_days ?? selectedType.max_days_per_year) - (balance?.used_days ?? 0), 0);

  return (
    <main className="min-h-screen bg-white px-4 py-6 text-[#111111] sm:px-6 sm:py-10">
      <section className="mx-auto max-w-5xl space-y-4">
        <div className="flex items-center justify-between rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_12px_32px_rgba(220,38,38,0.12)]">
          <div>
            <h1 className="text-2xl font-bold text-[#111111]">ขอลา</h1>
            <p className="mt-1 text-sm text-[#555555]">ยื่นคำขอลาพักร้อน ลาป่วย ลากิจ</p>
          </div>
          <Link to="/request" className="text-sm text-[#DC2626] transition hover:text-[#991B1B]">← กลับ</Link>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_10px_28px_rgba(220,38,38,0.10)]">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm font-semibold text-[#555555]">ประเภทการลา</label>
              <select value={form.leave_type_code} onChange={(e) => setForm((s) => ({ ...s, leave_type_code: e.target.value }))} className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] focus:border-[#DC2626]">
                {leaveTypes.map((item) => (<option key={item.code} value={item.code}>{item.name_th}</option>))}
              </select>
            </div>
            <div className="rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-sm text-[#444444]">
              <p>คงเหลือ: <strong>{remaining}</strong> วัน</p>
              <p>ใช้ไปแล้ว: <strong>{balance?.used_days ?? 0}</strong> วัน</p>
            </div>
            <div>
              <label className="text-sm font-semibold text-[#555555]">วันเริ่มลา</label>
              <input type="date" value={form.start_date} onChange={(e) => setForm((s) => ({ ...s, start_date: e.target.value }))} className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] focus:border-[#DC2626]" />
            </div>
            <div>
              <label className="text-sm font-semibold text-[#555555]">วันสิ้นสุดการลา</label>
              <input type="date" value={form.end_date} onChange={(e) => setForm((s) => ({ ...s, end_date: e.target.value }))} className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] focus:border-[#DC2626]" />
            </div>
          </div>

          <p className="text-sm text-[#444444]">จำนวนวันลา: <strong>{totalDays}</strong> วัน</p>

          <div>
            <label className="text-sm font-semibold text-[#555555]">เหตุผล</label>
            <textarea value={form.reason} onChange={(e) => setForm((s) => ({ ...s, reason: e.target.value }))} className="mt-1 min-h-24 w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111] focus:border-[#DC2626]" />
          </div>

          <div>
            <label className="text-sm font-semibold text-[#555555]">ไฟล์แนบ (ไม่บังคับ)</label>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => {
                const file = e.target.files?.[0] || null;
                if (file && !isAllowedFile(file)) { setError("อนุญาตเฉพาะ JPG, PNG, WEBP, PDF"); e.currentTarget.value = ""; return; }
                if (file && file.size > MAX_BYTES) { setError("ไฟล์ต้องไม่เกิน 5 MB"); e.currentTarget.value = ""; return; }
                setError("");
                setForm((s) => ({ ...s, attachment_file: file }));
              }}
              className="mt-1 w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-[#111111]"
            />
            <p className="mt-1 text-xs text-[#555555]">รองรับ JPG, PNG, WEBP, PDF ขนาดไม่เกิน 5 MB</p>
          </div>

          {error ? <div className="text-sm text-[#DC2626]">{error}</div> : null}
          {success ? <div className="text-sm text-[#15803D]">{success}</div> : null}

          <button disabled={busy || !totalDays} className="w-full rounded-xl bg-[#DC2626] px-6 py-2.5 font-semibold text-white shadow-[0_10px_24px_rgba(220,38,38,0.24)] transition hover:bg-[#991B1B] disabled:opacity-50 md:w-auto">
            {busy ? "กำลังดำเนินการ..." : "ยื่นคำขอ"}
          </button>
        </form>

        <section className="rounded-[1rem] border border-[#FECACA] bg-white p-5 shadow-[0_10px_28px_rgba(220,38,38,0.10)]">
          <h3 className="mb-3 text-lg font-bold text-[#DC2626]">ประวัติการขอลา</h3>
          {rows.length === 0 ? <p className="text-sm text-[#555555]">ไม่มีข้อมูล</p> : (
            <div className="space-y-2">
              {rows.map((row) => (
                <div key={row.id} className="rounded-xl border border-[#FECACA] bg-white p-3 text-sm">
                  <p className="font-semibold text-[#111111]">{row.leave_type_code} ({row.start_date} – {row.end_date})</p>
                  <p className="text-[#444444]">{row.total_days} วัน</p>
                  <p className="mt-1 text-xs text-[#444444]">สถานะ: <span className="font-semibold">{row.status}</span></p>
                  <p className="mt-1 text-xs text-[#555555]">{row.reason || "-"}</p>
                  {(row.status === "pending" || row.status === "approved") ? (
                    <button type="button" disabled={busy} onClick={() => cancelRequest(row.id)} className="mt-2 rounded-lg border border-[#FECACA] bg-white px-3 py-1.5 text-xs text-[#444444] transition hover:bg-[#FEF2F2] disabled:opacity-50">ยกเลิก</button>
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

