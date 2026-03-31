import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router";
import type { Route } from "./+types/scan";
import { requireSession } from "~/lib/require-session.server";
import { ensureDeviceIdCookie } from "~/lib/device-id";
import { useI18n } from "~/lib/i18n";
import { useGPSCollection } from "@/lib/useGPSCollection";
import { checkInternalNetwork, type NetworkCheckResult } from "@/lib/gpsSpoofingDetection";

const AUTH_ERRORS = new Set([
  "MISSING_SESSION_TOKEN", "MISSING_DEVICE_ID", "INVALID_SESSION",
  "SESSION_EXPIRED", "DEVICE_MISMATCH", "DEVICE_NOT_TRUSTED",
  "EMPLOYEE_NOT_FOUND", "FORBIDDEN",
]);

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = await requireSession(request, context);
  return { empId: session.emp_id };
}

type GpsState = {
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: number;
};

type LangCode = "th" | "en" | "lo";

type EmployeeLocationStatus = "collecting" | "verified" | "pending" | "blocked";

const SCAN_I18N: Record<LangCode, {
  title: string;
  loading: string;
  back: string;
  employeeInfo: string;
  date: string;
  workplace: string;
  selectArea: string;
  gpsStatus: string;
  locationVerificationStatus: string;
  statusLabel: string;
  nearest: string;
  coords: string;
  refreshGps: string;
  mapPlaceholder: string;
  suspicious: string;
  latestScan: string;
  noHistory: string;
  todayHistory: string;
  faceOptional: string;
  faceNote: string;
  captureSelfie: string;
  retakeSelfie: string;
  scanIn: string;
  scanOut: string;
  scanning: string;
  scanInSuccess: string;
  scanOutSuccess: string;
  needGpsFirst: string;
  gpsNotSupported: string;
  gpsFailed: string;
  cameraNotSupported: string;
  cameraStartFailed: string;
  loadFailed: string;
  statusWaiting: string;
  statusInside: string;
  statusOutside: string;
  statusSuspicious: string;
  collectingLocation: string;
  locationVerifiedFriendly: string;
  locationPendingFriendly: string;
  locationBlockedFriendly: string;
  savingPrefix: string;
  timeLabel: string;
}> = {
  th: {
    title: "สแกนเข้า/ออกงาน",
    loading: "กำลังโหลดข้อมูล...",
    back: "กลับ",
    employeeInfo: "ข้อมูลพนักงาน",
    date: "วันที่",
    workplace: "พื้นที่ทำงาน",
    selectArea: "เลือกพื้นที่",
    gpsStatus: "สถานะ GPS",
    locationVerificationStatus: "การยืนยันตำแหน่ง",
    statusLabel: "สถานะ",
    nearest: "จุดใกล้สุด",
    coords: "พิกัด",
    refreshGps: "อัปเดต GPS",
    mapPlaceholder: "กดอัปเดต GPS เพื่อแสดงแผนที่",
    suspicious: "พบความผิดปกติ",
    latestScan: "ลงเวลาล่าสุด",
    noHistory: "ยังไม่มีประวัติการสแกนวันนี้",
    todayHistory: "ประวัติการสแกนวันนี้",
    faceOptional: "เปิดใช้งานการตรวจสอบใบหน้า (ไม่บังคับ)",
    faceNote: "ฟังก์ชันตรวจใบหน้า/ตรวจการมีชีวิตจะเปิดใช้ในขั้นตอนถัดไป",
    captureSelfie: "ถ่ายรูปเซลฟี่",
    retakeSelfie: "ถ่ายใหม่",
    scanIn: "สแกนเข้า",
    scanOut: "สแกนออก",
    scanning: "กำลังบันทึก...",
    scanInSuccess: "สแกนเข้าเรียบร้อย",
    scanOutSuccess: "สแกนออกเรียบร้อย",
    needGpsFirst: "กรุณาตรวจสอบ GPS ก่อนสแกน",
    gpsNotSupported: "อุปกรณ์นี้ไม่รองรับ GPS",
    gpsFailed: "ไม่สามารถดึงตำแหน่งได้",
    cameraNotSupported: "อุปกรณ์นี้ไม่รองรับกล้อง",
    cameraStartFailed: "ไม่สามารถเปิดกล้องได้",
    loadFailed: "โหลดข้อมูลไม่สำเร็จ",
    statusWaiting: "รอตรวจสอบตำแหน่ง",
    statusInside: "อยู่ในพื้นที่ทำงาน",
    statusOutside: "อยู่นอกพื้นที่ทำงาน",
    statusSuspicious: "พบความผิดปกติของ GPS",
    collectingLocation: "กำลังตรวจสอบตำแหน่ง...",
    locationVerifiedFriendly: "ยืนยันตำแหน่งแล้ว ✅",
    locationPendingFriendly: "รอตรวจสอบตำแหน่ง ⚠️",
    locationBlockedFriendly: "ไม่สามารถยืนยันตำแหน่งได้ ❌",
    savingPrefix: "กำลังอัปโหลดรูปถ่าย...",
    timeLabel: "เวลา",
  },
  en: {
    title: "Scan In/Out",
    loading: "Loading data...",
    back: "Back",
    employeeInfo: "Employee Information",
    date: "Date",
    workplace: "Work Area",
    selectArea: "Select Area",
    gpsStatus: "GPS Status",
    locationVerificationStatus: "Location Verification",
    statusLabel: "Status",
    nearest: "Nearest",
    coords: "Coordinates",
    refreshGps: "Refresh GPS",
    mapPlaceholder: "Press refresh GPS to show map",
    suspicious: "Suspicious signals",
    latestScan: "Latest scan",
    noHistory: "No scan history for today",
    todayHistory: "Today's scan history",
    faceOptional: "Enable face verification (optional)",
    faceNote: "Face match and liveness verification will be enabled in the next phase",
    captureSelfie: "Capture Selfie",
    retakeSelfie: "Retake",
    scanIn: "Scan In",
    scanOut: "Scan Out",
    scanning: "Saving...",
    scanInSuccess: "Scan in completed",
    scanOutSuccess: "Scan out completed",
    needGpsFirst: "Please verify GPS before scanning",
    gpsNotSupported: "This device does not support GPS",
    gpsFailed: "Unable to get location",
    cameraNotSupported: "This device does not support camera",
    cameraStartFailed: "Unable to open camera",
    loadFailed: "Failed to load attendance data",
    statusWaiting: "Waiting for location check",
    statusInside: "Inside work area",
    statusOutside: "Outside work area",
    statusSuspicious: "Suspicious GPS detected",
    collectingLocation: "Collecting location...",
    locationVerifiedFriendly: "Location verified ✅",
    locationPendingFriendly: "Location check pending ⚠️",
    locationBlockedFriendly: "Unable to verify location ❌",
    savingPrefix: "Uploading selfie...",
    timeLabel: "Time",
  },
  lo: {
    title: "ສະແກນເຂົ້າ/ອອກ",
    loading: "ກຳລັງໂຫຼດຂໍ້ມູນ...",
    back: "ກັບ",
    employeeInfo: "ຂໍ້ມູນພະນັກງານ",
    date: "ວັນທີ",
    workplace: "ພື້ນທີ່ເຮັດວຽກ",
    selectArea: "ເລືອກພື້ນທີ່",
    gpsStatus: "ສະຖານະ GPS",
    locationVerificationStatus: "ການຢືນຢັນຕຳແໜ່ງ",
    statusLabel: "ສະຖານະ",
    nearest: "ຈຸດໃກ້ສຸດ",
    coords: "ພິກັດ",
    refreshGps: "ອັບເດດ GPS",
    mapPlaceholder: "ກົດອັບເດດ GPS ເພື່ອສະແດງແຜນທີ່",
    suspicious: "ສັນຍານຜິດປົກກະຕິ",
    latestScan: "ສະແກນຫຼ້າສຸດ",
    noHistory: "ຍັງບໍ່ມີປະຫວັດການສະແກນມື້ນີ້",
    todayHistory: "ປະຫວັດການສະແກນມື້ນີ້",
    faceOptional: "ເປີດໃຊ້ການກວດໃບໜ້າ (ບໍ່ບັງຄັບ)",
    faceNote: "ການກວດໃບໜ້າ ແລະ liveness ຈະເປີດໃຊ້ໃນຂັ້ນຕໍ່ໄປ",
    captureSelfie: "ຖ່າຍເຊວຟີ້",
    retakeSelfie: "ຖ່າຍໃໝ່",
    scanIn: "ສະແກນເຂົ້າ",
    scanOut: "ສະແກນອອກ",
    scanning: "ກຳລັງບັນທຶກ...",
    scanInSuccess: "ສະແກນເຂົ້າສຳເລັດ",
    scanOutSuccess: "ສະແກນອອກສຳເລັດ",
    needGpsFirst: "ກະລຸນາກວດສອບ GPS ກ່ອນສະແກນ",
    gpsNotSupported: "ອຸປະກອນນີ້ບໍ່ຮອງຮັບ GPS",
    gpsFailed: "ບໍ່ສາມາດດຶງຕຳແໜ່ງໄດ້",
    cameraNotSupported: "ອຸປະກອນນີ້ບໍ່ຮອງຮັບກ້ອງ",
    cameraStartFailed: "ບໍ່ສາມາດເປີດກ້ອງໄດ້",
    loadFailed: "ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ",
    statusWaiting: "ກຳລັງລໍຖ້າການກວດສອບຕຳແໜ່ງ",
    statusInside: "ຢູ່ໃນເຂດເຮັດວຽກ",
    statusOutside: "ຢູ່ນອກເຂດເຮັດວຽກ",
    statusSuspicious: "ພົບ GPS ຜິດປົກກະຕິ",
    collectingLocation: "ກຳລັງເກັບຂໍ້ມູນຕຳແໜ່ງ...",
    locationVerifiedFriendly: "ຢືນຢັນຕຳແໜ່ງແລ້ວ ✅",
    locationPendingFriendly: "ກຳລັງລໍຖ້າການກວດສອບ ⚠️",
    locationBlockedFriendly: "ບໍ່ສາມາດຢືນຢັນຕຳແໜ່ງໄດ້ ❌",
    savingPrefix: "ກຳລັງອັບໂຫຼດຮູບ...",
    timeLabel: "ເວລາ",
  },
};

function calculateNetworkSuspicionPoints(networkCheck: NetworkCheckResult | null): number {
  if (!networkCheck) return 0;
  if (!networkCheck.isOnCompanyNetwork) return 20;
  if (networkCheck.responseTime > 2000) return 10;
  return 0;
}

declare global {
  interface Window {
    // LIFF SDK removed
  }
}

// LIFF SDK removed after March 2026

async function getLiffIdToken() {
  // LIFF has been removed - return empty string
  return "";
}

function makeDeviceId() {
  return ensureDeviceIdCookie();
}

function collectGpsFlags(position: GpsState) {
  const flags: string[] = [];
  if (Number(position.accuracy) > 0 && Number(position.accuracy) < 5) {
    flags.push("accuracy_too_precise_client");
  }
  if (!Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) {
    flags.push("invalid_coordinate_client");
  }
  return flags;
}

const MONTH_TH = [
  "มกราคม",
  "กุมภาพันธ์",
  "มีนาคม",
  "เมษายน",
  "พฤษภาคม",
  "มิถุนายน",
  "กรกฎาคม",
  "สิงหาคม",
  "กันยายน",
  "ตุลาคม",
  "พฤศจิกายน",
  "ธันวาคม",
];
const DAY_TH = ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"];

function getMonthYearFromOffset(offset: number) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return { y: d.getFullYear(), m: d.getMonth() };
}

function formatDurationNightAware(
  inH: number,
  inM: number,
  outH: number,
  outM: number,
  isNight: boolean,
) {
  const inT = inH * 60 + inM;
  let outT = outH * 60 + outM;
  if (isNight && outT < inT) outT += 24 * 60;
  const total = outT - inT;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h} ชม. ${m} น.`;
}

type HistRow = {
  d: number;
  dow: number;
  type: "normal" | "weekend" | "holiday" | "absent" | "leave";
  label?: string;
  inH?: number;
  inM?: number;
  outH?: number;
  outM?: number;
  late?: boolean;
  ot?: boolean;
  isNight?: boolean;
};

function seedHistoryMonth(m: number, y: number): HistRow[] {
  const rows: HistRow[] = [];
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const holidays = new Set([13, 14, 15]);
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m, d);
    const dow = date.getDay();
    if (dow === 0 || dow === 6) {
      rows.push({ d, dow, type: "weekend" });
      continue;
    }
    if (holidays.has(d)) {
      rows.push({ d, dow, type: "holiday", label: "วันหยุดนักขัตฤกษ์" });
      continue;
    }
    const rand = (d * 7 + m * 3 + y) % 17;
    if (rand === 0) {
      rows.push({ d, dow, type: "absent" });
      continue;
    }
    if (rand === 1) {
      rows.push({ d, dow, type: "leave", label: "ลาพักร้อน" });
      continue;
    }
    const isNight = rand >= 12 && rand <= 14;
    const inH = isNight ? 20 : rand < 4 ? 8 : rand < 6 ? 8 : rand < 8 ? 9 : 8;
    const inM = isNight ? 0 : rand < 4 ? rand * 3 : rand < 6 ? 5 + rand : rand < 8 ? rand : 0;
    const outH = isNight ? 6 : 17 + (rand % 3 === 0 ? 2 : 0);
    const outM = (rand * 5) % 60;
    const late = !isNight && (inH > 8 || (inH === 8 && inM > 5));
    const ot = !isNight && outH >= 19;
    rows.push({ d, dow, type: "normal", inH, inM, outH, outM, late, ot, isNight });
  }
  return rows;
}

const LEAVE_QUOTA_ROWS = [
  { type: "ลาพักร้อน", quota: 10, color: "#8B5CF6", bg: "#F5F3FF" },
  { type: "ลาป่วย", quota: 30, color: "#E8193A", bg: "#FFF0F3" },
  { type: "ลากิจ", quota: 3, color: "#F59E0B", bg: "#FFFBEB" },
  { type: "ลาคลอด/บิดา", quota: 90, color: "#EC4899", bg: "#FDF2F8" },
  { type: "ลาหยุดชดเชย OT", quota: 15, color: "#0EA5E9", bg: "#F0F9FF" },
  { type: "ลาไม่รับค่าจ้าง", quota: 30, color: "#6B7280", bg: "#F9FAFB" },
  { type: "ลาอื่นๆ", quota: 5, color: "#16A34A", bg: "#F0FDF4" },
] as const;

type SetSearch = ReturnType<typeof useSearchParams>[1];

function ScanHistoryTab({
  monthOffset,
  shiftFilter,
  setSearchParams,
}: {
  monthOffset: number;
  shiftFilter: string;
  setSearchParams: SetSearch;
}) {
  const { m, y } = getMonthYearFromOffset(monthOffset);
  const bey = y + 543;
  const rows = seedHistoryMonth(m, y);
  const workRows = rows.filter((r) => r.type !== "weekend");
  const normalRows = workRows.filter((r) => r.type === "normal");
  const summary = {
    days: normalRows.length,
    night: normalRows.filter((r) => r.isNight).length,
    late: normalRows.filter((r) => r.late).length,
    otHours: normalRows.filter((r) => r.ot).length * 2 || 0,
  };

  let displayRows = [...workRows].reverse();
  if (shiftFilter === "day") displayRows = displayRows.filter((r) => r.type === "normal" && !r.isNight);
  if (shiftFilter === "night") displayRows = displayRows.filter((r) => r.type === "normal" && r.isNight);
  if (shiftFilter === "ot") displayRows = displayRows.filter((r) => r.type === "normal" && r.ot);
  if (shiftFilter === "absent") displayRows = displayRows.filter((r) => r.type === "absent" || r.type === "leave");

  function setMonthOffset(next: number) {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set("tab", "history");
        n.set("mo", String(next));
        return n;
      },
      { replace: true },
    );
  }

  function setFilter(f: string) {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set("tab", "history");
        n.set("filter", f);
        return n;
      },
      { replace: true },
    );
  }

  const chip = (id: string, label: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setFilter(id)}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition active:scale-95 ${
        shiftFilter === id
          ? "border-[#D0002A] bg-[#D0002A] text-white"
          : "border-black/[0.07] bg-white text-[#5A5A6B]"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-black/[0.07] bg-white px-3.5 py-3">
        <button
          type="button"
          onClick={() => setMonthOffset(monthOffset - 1)}
          className="flex size-9 items-center justify-center rounded-[10px] border border-black/[0.07] bg-[#F4F4F6] text-[#5A5A6B] transition active:bg-black/[0.06]"
          aria-label="เดือนก่อน"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="text-[15px] font-bold tracking-[-0.3px] text-[#0D0D0D]">
          {MONTH_TH[m]} {bey}
        </span>
        <button
          type="button"
          disabled={monthOffset >= 0}
          onClick={() => setMonthOffset(monthOffset + 1)}
          className="flex size-9 items-center justify-center rounded-[10px] border border-black/[0.07] bg-[#F4F4F6] text-[#5A5A6B] transition enabled:active:bg-black/[0.06] disabled:cursor-default disabled:opacity-30"
          aria-label="เดือนถัดไป"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      <div className="relative flex rounded-2xl border border-black/[0.07] bg-white py-3.5">
        {[
          { v: summary.days, l: "วันทำงาน" },
          { v: summary.night, l: "กะกลางคืน" },
          { v: summary.late, l: "มาสาย" },
          { v: summary.otHours, l: "OT ชม." },
        ].map((cell, i) => (
          <div key={cell.l} className="relative flex min-w-0 flex-1 flex-col items-center px-1 text-center">
            {i > 0 ? (
              <div className="absolute left-0 top-1/2 h-8 w-px -translate-y-1/2 bg-black/[0.07]" aria-hidden />
            ) : null}
            <p className="text-xl font-bold tracking-[-0.5px] text-[#0D0D0D]">{cell.v}</p>
            <p className="mt-0.5 text-[10px] font-medium text-[#9898AA]">{cell.l}</p>
          </div>
        ))}
      </div>

      <div className="-mx-1 flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chip("all", "ทั้งหมด")}
        {chip("day", "กะเช้า")}
        {chip("night", "กะกลางคืน")}
        {chip("ot", "OT")}
        {chip("absent", "ขาด/ลา")}
      </div>

      <div>
        <h3 className="mb-2 mt-1 text-xs font-bold uppercase tracking-[0.8px] text-[#9898AA]">รายวัน</h3>
        <div className="flex flex-col gap-2">
          {displayRows.length === 0 ? (
            <p className="py-8 text-center text-sm text-[#9898AA]">ไม่มีข้อมูลในช่วงที่เลือก</p>
          ) : (
            displayRows.map((row) => {
              const weekday = DAY_TH[row.dow];
              const boxCls = "flex size-11 shrink-0 flex-col items-center justify-center rounded-xl bg-[#F4F4F6]";
              if (row.type === "holiday") {
                return (
                  <div
                    key={`h-${row.d}`}
                    className="flex items-center gap-3 rounded-[14px] border border-black/[0.07] bg-white px-3.5 py-3"
                  >
                    <div className={boxCls}>
                      <span className="text-lg font-bold text-[#0D0D0D]">{row.d}</span>
                      <span className="text-[9px] font-semibold tracking-[0.3px] text-[#9898AA]">{weekday}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[#9898AA]">วันหยุดนักขัตฤกษ์</p>
                      <span className="mt-1 inline-block rounded-full bg-[#F4F4F6] px-2 py-0.5 text-[10px] font-semibold text-[#9898AA]">
                        {row.label}
                      </span>
                    </div>
                  </div>
                );
              }
              if (row.type === "absent") {
                return (
                  <div
                    key={`a-${row.d}`}
                    className="flex items-center gap-3 rounded-[14px] border border-black/[0.07] bg-white px-3.5 py-3"
                  >
                    <div className={boxCls}>
                      <span className="text-lg font-bold text-[#D0002A]">{row.d}</span>
                      <span className="text-[9px] font-semibold tracking-[0.3px] text-[#9898AA]">{weekday}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[#D0002A]">ไม่มีการบันทึก</p>
                      <span className="mt-1 inline-block rounded-full bg-[#FFF0F3] px-2 py-0.5 text-[10px] font-semibold text-[#D0002A]">
                        ขาดงาน
                      </span>
                    </div>
                  </div>
                );
              }
              if (row.type === "leave") {
                return (
                  <div
                    key={`l-${row.d}`}
                    className="flex items-center gap-3 rounded-[14px] border border-black/[0.07] bg-white px-3.5 py-3"
                  >
                    <div className={boxCls}>
                      <span className="text-lg font-bold text-[#0D0D0D]">{row.d}</span>
                      <span className="text-[9px] font-semibold tracking-[0.3px] text-[#9898AA]">{weekday}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-[#8B5CF6]">{row.label}</p>
                      <span className="mt-1 inline-block rounded-full bg-[#F5F3FF] px-2 py-0.5 text-[10px] font-semibold text-[#8B5CF6]">
                        ลา
                      </span>
                    </div>
                  </div>
                );
              }
              const pad = (n: number) => String(n).padStart(2, "0");
              const inH = row.inH ?? 0;
              const inM = row.inM ?? 0;
              const outH = row.outH ?? 0;
              const outM = row.outM ?? 0;
              const isNight = Boolean(row.isNight);
              const dur = formatDurationNightAware(inH, inM, outH, outM, isNight);
              return (
                <div
                  key={`n-${row.d}`}
                  className="flex items-center gap-3 rounded-[14px] border border-black/[0.07] bg-white px-3.5 py-3"
                >
                  <div className={boxCls}>
                    <span className="text-lg font-bold text-[#0D0D0D]">{row.d}</span>
                    <span className="text-[9px] font-semibold tracking-[0.3px] text-[#9898AA]">{weekday}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                      <span className="font-bold text-[#00B96B]">
                        {pad(inH)}:{pad(inM)}
                      </span>
                      <span className="text-[#9898AA]">→</span>
                      <span className={`font-bold ${isNight ? "text-[#5A5A6B]" : "text-[#5A5A6B]"}`}>
                        {pad(outH)}:{pad(outM)}
                      </span>
                      <span className="text-[11px] text-[#9898AA]">· {dur}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {isNight ? (
                        <span className="rounded-full bg-[#EEF2FF] px-2 py-0.5 text-[10px] font-semibold text-[#4F46E5]">
                          กะกลางคืน
                        </span>
                      ) : row.late ? (
                        <span className="rounded-full bg-[#FFFBEB] px-2 py-0.5 text-[10px] font-semibold text-[#F59E0B]">
                          มาสาย
                        </span>
                      ) : (
                        <span className="rounded-full bg-[#EDFBF4] px-2 py-0.5 text-[10px] font-semibold text-[#00B96B]">
                          ปกติ
                        </span>
                      )}
                      {row.ot ? (
                        <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[10px] font-semibold text-[#3B82F6]">
                          OT
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <svg className="shrink-0 text-[#9898AA]" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

function ScanLeaveTab({
  leaveView,
  leaveYearOffset,
  leaveMonthOffset,
  setSearchParams,
}: {
  leaveView: "year" | "month";
  leaveYearOffset: number;
  leaveMonthOffset: number;
  setSearchParams: SetSearch;
}) {
  const [expandedMonth, setExpandedMonth] = useState<number | null>(2);

  const usedByType: Record<string, number> = {
    ลาพักร้อน: 4,
    ลาป่วย: 2,
    ลากิจ: 1,
    "ลาคลอด/บิดา": 0,
    "ลาหยุดชดเชย OT": 0,
    "ลาไม่รับค่าจ้าง": 0,
    "ลาอื่นๆ": 0,
  };

  const monthDetail = [
    { m: 0, items: [{ days: 2, type: "ลากิจ", range: "8–9 ม.ค." }] },
    { m: 2, items: [{ days: 1, type: "ลาป่วย", range: "21 มี.ค." }] },
  ];

  function patchParams(mut: (n: URLSearchParams) => void) {
    setSearchParams(
      (prev) => {
        const n = new URLSearchParams(prev);
        n.set("tab", "leave");
        mut(n);
        return n;
      },
      { replace: true },
    );
  }

  if (leaveView === "month") {
    const { m, y } = getMonthYearFromOffset(leaveMonthOffset);
    const bey = y + 543;
    const monthLeaves = [
      { type: "ลาป่วย", range: "21 มี.ค.", days: 1 },
      { type: "ลาพักร้อน", range: "28–29 มี.ค.", days: 2 },
    ];
    return (
      <div className="space-y-4">
        <div className="flex gap-1 rounded-xl bg-[#F4F4F6] p-1">
          <button
            type="button"
            onClick={() => patchParams((n) => n.set("leaveView", "year"))}
            className="flex-1 rounded-lg py-2 text-[13px] font-semibold text-[#9898AA] transition"
          >
            รายปี
          </button>
          <button
            type="button"
            className="flex-1 rounded-lg bg-white py-2 text-[13px] font-semibold text-[#0D0D0D] shadow-sm"
          >
            รายเดือน
          </button>
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-black/[0.07] bg-white px-3.5 py-3">
          <button
            type="button"
            onClick={() => patchParams((n) => n.set("lm", String(leaveMonthOffset - 1)))}
            className="flex size-9 items-center justify-center rounded-[10px] border border-black/[0.07] bg-[#F4F4F6]"
            aria-label="เดือนก่อน"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <span className="text-[15px] font-bold text-[#0D0D0D]">
            {MONTH_TH[m]} {bey}
          </span>
          <button
            type="button"
            disabled={leaveMonthOffset >= 0}
            onClick={() => patchParams((n) => n.set("lm", String(leaveMonthOffset + 1)))}
            className="flex size-9 items-center justify-center rounded-[10px] border border-black/[0.07] bg-[#F4F4F6] disabled:opacity-30"
            aria-label="เดือนถัดไป"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {LEAVE_QUOTA_ROWS.filter((q) => (usedByType[q.type] || 0) > 0).map((q) => {
            const u = usedByType[q.type] || 0;
            return (
              <div key={q.type} className="flex items-center gap-2.5 rounded-[14px] border border-black/[0.07] bg-white px-3 py-3.5">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: q.bg }}>
                  <span className="text-[10px] font-bold" style={{ color: q.color }}>
                    ·
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-semibold text-[#0D0D0D]">{q.type}</p>
                  <p className="mt-1 text-[10px] text-[#9898AA]">
                    เดือนนี้ <strong className="text-[#0D0D0D]">{u}</strong> วัน
                  </p>
                </div>
              </div>
            );
          })}
        </div>
        <h3 className="text-xs font-bold uppercase tracking-[0.8px] text-[#9898AA]">รายการลาในเดือนนี้</h3>
        <div className="flex flex-col gap-2">
          {monthLeaves.map((row) => {
            const meta = LEAVE_QUOTA_ROWS.find((q) => q.type === row.type);
            return (
              <div
                key={row.range}
                className="flex items-center gap-3 rounded-[14px] border border-black/[0.07] bg-white px-3 py-3"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: meta?.bg }}>
                  <span className="text-[10px] font-bold" style={{ color: meta?.color }}>
                    ·
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-[#0D0D0D]">{row.type}</p>
                  <p className="mt-0.5 text-[10px] text-[#9898AA]">
                    <strong className="text-[#0D0D0D]">{row.range}</strong> · {row.days} วัน
                  </p>
                </div>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                  style={{ background: meta?.bg, color: meta?.color }}
                >
                  {row.days} วัน
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const beYear = new Date().getFullYear() + 543 + leaveYearOffset;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-xl bg-[#F4F4F6] p-1">
        <button type="button" className="flex-1 rounded-lg bg-white py-2 text-[13px] font-semibold text-[#0D0D0D] shadow-sm">
          รายปี
        </button>
        <button
          type="button"
          onClick={() => patchParams((n) => n.set("leaveView", "month"))}
          className="flex-1 rounded-lg py-2 text-[13px] font-semibold text-[#9898AA]"
        >
          รายเดือน
        </button>
      </div>

      <div className="flex items-center justify-between rounded-2xl border border-black/[0.07] bg-white px-3.5 py-3">
        <button
          type="button"
          onClick={() => patchParams((n) => n.set("ly", String(leaveYearOffset - 1)))}
          className="flex size-9 items-center justify-center rounded-[10px] border border-black/[0.07] bg-[#F4F4F6]"
          aria-label="ปีก่อน"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <span className="text-[15px] font-bold text-[#0D0D0D]">{beYear}</span>
        <button
          type="button"
          disabled={leaveYearOffset >= 0}
          onClick={() => patchParams((n) => n.set("ly", String(leaveYearOffset + 1)))}
          className="flex size-9 items-center justify-center rounded-[10px] border border-black/[0.07] bg-[#F4F4F6] disabled:opacity-30"
          aria-label="ปีถัดไป"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden>
            <path d="M9 18l6-6-6-6" />
          </svg>
        </button>
      </div>

      <h3 className="text-xs font-bold uppercase tracking-[0.8px] text-[#9898AA]">
        โควตาการลาปี <span className="normal-case text-[#0D0D0D]">{beYear}</span>
      </h3>
      <div className="grid grid-cols-2 gap-2">
        {LEAVE_QUOTA_ROWS.map((q) => {
          const u = usedByType[q.type] || 0;
          const pct = Math.min(100, Math.round((u / q.quota) * 100));
          const over = u > q.quota;
          return (
            <div
              key={q.type}
              className={`flex items-center gap-2.5 rounded-[14px] border px-3 py-3.5 ${
                over ? "border-[#FCA5A5] bg-[#FFF8F8]" : "border-black/[0.07] bg-white"
              }`}
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-[10px]" style={{ background: q.bg }}>
                <span className="text-[10px] font-bold" style={{ color: q.color }}>
                  ·
                </span>
              </div>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-xs font-semibold ${over ? "text-[#D0002A]" : "text-[#0D0D0D]"}`}>{q.type}</p>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-[#F4F4F6]">
                  <div
                    className="h-full rounded-full transition-[width]"
                    style={{
                      width: `${pct}%`,
                      background: over ? "#D0002A" : q.color,
                    }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-[#9898AA]">
                  ใช้ไป <strong className="text-[#0D0D0D]">{u}</strong> / {q.quota} วัน
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-[0.8px] text-[#9898AA]">รายละเอียดแต่ละเดือน</h3>
        <span className="text-[11px] text-[#9898AA]">กดเพื่อขยาย</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {monthDetail.map(({ m: mi, items }) => {
          const open = expandedMonth === mi;
          return (
            <div key={mi}>
              <button
                type="button"
                onClick={() => setExpandedMonth(open ? null : mi)}
                className="flex w-full items-center gap-2.5 rounded-xl border border-black/[0.07] bg-white px-3.5 py-3 text-left transition active:bg-[#F4F4F6]"
              >
                <span className="w-[72px] shrink-0 text-[13px] font-bold text-[#0D0D0D]">{MONTH_TH[mi].slice(0, 3)}.</span>
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {items.map((it) => (
                    <span
                      key={it.type}
                      className="rounded-full px-2 py-0.5 text-[10px] font-semibold"
                      style={{
                        background: LEAVE_QUOTA_ROWS.find((q) => q.type === it.type)?.bg,
                        color: LEAVE_QUOTA_ROWS.find((q) => q.type === it.type)?.color,
                      }}
                    >
                      {it.type} {it.days} วัน
                    </span>
                  ))}
                </div>
                <svg
                  className={`shrink-0 text-[#9898AA] transition ${open ? "rotate-90" : ""}`}
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  aria-hidden
                >
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
              {open ? (
                <div className="mx-1 mt-1 space-y-0 rounded-lg bg-[#F4F4F6] px-3 py-2">
                  {items.map((it) => (
                    <div
                      key={it.type}
                      className="flex justify-between border-b border-black/[0.06] py-1.5 text-xs last:border-b-0"
                    >
                      <span className="text-[#5A5A6B]">{it.range}</span>
                      <span className="font-semibold text-[#0D0D0D]">{it.type}</span>
                      <span className="text-[#9898AA]">{it.days} วัน</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

async function uploadSelfieToCloudinary(dataUrl: string, folder: string) {
  const blob = await (await fetch(dataUrl)).blob();
  const file = new File([blob], `selfie-${Date.now()}.jpg`, { type: "image/jpeg" });

  const signRes = await fetch("/api/cloudinary/sign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder }),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sign: any = await signRes.json();
  if (!signRes.ok) throw new Error(sign.error || "SIGN_FAILED");

  const fd = new FormData();
  fd.append("file", file);
  fd.append("folder", folder);
  fd.append("timestamp", String(sign.timestamp));
  fd.append("signature", sign.signature);
  fd.append("api_key", sign.apiKey);

  const uploadRes = await fetch(`https://api.cloudinary.com/v1_1/${sign.cloudName}/image/upload`, {
    method: "POST",
    body: fd,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uploaded: any = await uploadRes.json();
  if (!uploadRes.ok) throw new Error(uploaded?.error?.message || "UPLOAD_FAILED");
  return String(uploaded.secure_url || "");
}

export default function ScanPage({ loaderData }: Route.ComponentProps) {
  const navigate = useNavigate();
  const { lang } = useI18n();
  const [now, setNow] = useState(new Date());
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [todayData, setTodayData] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [locations, setLocations] = useState<any[]>([]);
  const [selectedWorkArea, setSelectedWorkArea] = useState("");
  const [gps, setGps] = useState<GpsState | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [locationCheck, setLocationCheck] = useState<any>(null);
  const [gpsError, setGpsError] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "" | "error" | "success"; message: string }>({ type: "", message: "" });
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [selfieDataUrl, setSelfieDataUrl] = useState<string | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [networkCheck, setNetworkCheck] = useState<NetworkCheckResult | null>(null);
  const [networkReady, setNetworkReady] = useState(false);
  const [todayLoaded, setTodayLoaded] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const gpsCollection = useGPSCollection({
    readingsCount: 5,
    readingInterval: 3000,
    autoStart: true,
  });

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const deviceIdRef = useRef<string>("");

  useEffect(() => {
    deviceIdRef.current = ensureDeviceIdCookie();
  }, []);

  function attendanceHeaders(extra?: Record<string, string>) {
    const headers: Record<string, string> = { ...extra };
    if (deviceIdRef.current) {
      headers["x-device-id"] = deviceIdRef.current;
    }
    return headers;
  }

  const latestCollectedGps = useMemo(() => {
    if (!gpsCollection.positions.length) return null;
    const latest = gpsCollection.positions[gpsCollection.positions.length - 1];
    return {
      latitude: latest.latitude,
      longitude: latest.longitude,
      accuracy: Number(latest.accuracy || 0),
      timestamp: latest.timestamp,
    } as GpsState;
  }, [gpsCollection.positions]);

  async function loadToday() {
    try {
      if (!deviceIdRef.current) {
        deviceIdRef.current = ensureDeviceIdCookie();
      }
      const todayRes = await fetch("/api/attendance/today", { headers: attendanceHeaders() });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const todayJson: any = await todayRes.json();

      if (!todayRes.ok) {
        if (AUTH_ERRORS.has(todayJson.error)) {
          navigate("/login", { replace: true });
          return;
        }
        throw new Error(todayJson.error || SCAN_I18N[lang].loadFailed);
      }

      setTodayData(todayJson);
      setFeedback({ type: "", message: "" });
    } finally {
      setTodayLoaded(true);
    }
  }

  async function loadWorkLocations() {
    const locationRes = await fetch("/api/work-locations", { headers: attendanceHeaders() });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const locationJson: any = await locationRes.json().catch(() => ({ rows: [] }));
    if (!locationRes.ok) return;

    setLocations(locationJson.rows || []);
  }

  async function verifyLocation(position: GpsState, clientFlags: string[] = []) {
    const res = await fetch("/api/attendance/verify-location", {
      method: "POST",
      headers: attendanceHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
        captured_at: new Date(position.timestamp).toISOString(),
        fake_flags: clientFlags,
      }),
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = await res.json();
    if (!res.ok) throw new Error(data.error || "VERIFY_LOCATION_FAILED");
    setLocationCheck(data);
    return data;
  }

  async function refreshGps() {
    if (!navigator.geolocation) {
      setGpsError(SCAN_I18N[lang].gpsNotSupported);
      return;
    }

    setGpsError("");

    const current = await new Promise<GpsState | null>((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          });
        },
        () => resolve(null),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    });

    if (!current) {
      setGpsError(SCAN_I18N[lang].gpsFailed);
      return;
    }

    setGps(current);
    const flags = collectGpsFlags(current);

    try {
      await verifyLocation(current, flags);
    } catch (err: unknown) {
      setGpsError(err instanceof Error ? err.message : "VERIFY_LOCATION_FAILED");
    }
  }

  function stopCamera() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }

  async function startCamera() {
    setCameraError("");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(SCAN_I18N[lang].cameraNotSupported);
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => null);
      }
    } catch (err: unknown) {
      setCameraError(err instanceof Error ? err.message : SCAN_I18N[lang].cameraStartFailed);
    }
  }

  function takeSelfie() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setSelfieDataUrl(canvas.toDataURL("image/jpeg", 0.85));
  }

  async function handleScan() {
    if (!gps) {
      setFeedback({ type: "error", message: SCAN_I18N[lang].needGpsFirst });
      return;
    }

    setBusy(true);
    setFeedback({ type: "", message: "" });

    try {
      let selfieUrl: string | null = null;

      if (cameraEnabled && selfieDataUrl) {
        setFeedback({ type: "", message: SCAN_I18N[lang].savingPrefix });
        selfieUrl = await uploadSelfieToCloudinary(selfieDataUrl, "tdone-attendance/scan");
      }

      const res = await fetch("/api/attendance/scan", {
        method: "POST",
        headers: attendanceHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          employeeId: loaderData.empId,
          timestamp: new Date(gps.timestamp).toISOString(),
          gpsPosition: {
            latitude: gps.latitude,
            longitude: gps.longitude,
            accuracy: gps.accuracy,
          },
          suspicionScore: finalSuspicionScore,
          suspicionFlags: finalSuspicionFlags,
          faceMatchScore: null,
          deviceId: makeDeviceId(),
          latitude: gps.latitude,
          longitude: gps.longitude,
          accuracy: gps.accuracy,
          captured_at: new Date(gps.timestamp).toISOString(),
          fake_flags: [...new Set([...collectGpsFlags(gps), ...finalSuspicionFlags])],
          device_id: makeDeviceId(),
          device_name: navigator.userAgent,
          face_verified: false,
          selfie_url: selfieUrl,
        }),
      });

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data: any = await res.json();
      if (!res.ok) {
        setFeedback({ type: "error", message: data.error || "SCAN_FAILED" });
        return;
      }

      setFeedback({
        type: "success",
        message: data.action === "scan_in" ? SCAN_I18N[lang].scanInSuccess : SCAN_I18N[lang].scanOutSuccess,
      });

      await loadToday();
      await refreshGps();
    } catch (err: unknown) {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "SCAN_FAILED" });
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    loadToday().catch((err: unknown) => {
      setFeedback({ type: "error", message: err instanceof Error ? err.message : SCAN_I18N[lang].loadFailed });
    });
  }, [lang]);

  useEffect(() => {
    void loadWorkLocations();
  }, []);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const result = await checkInternalNetwork("/api/ping", 3000);
      if (cancelled) return;
      setNetworkCheck(result);
      setNetworkReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!gpsCollection.isReady || !latestCollectedGps) return;

    setGps(latestCollectedGps);
    const clientFlags = collectGpsFlags(latestCollectedGps);
    void verifyLocation(latestCollectedGps, clientFlags).catch((err: unknown) => {
      setGpsError(err instanceof Error ? err.message : "VERIFY_LOCATION_FAILED");
    });
  }, [gpsCollection.isReady, latestCollectedGps]);

  useEffect(() => {
    if (cameraEnabled) {
      void startCamera();
    } else {
      stopCamera();
      setSelfieDataUrl(null);
      setCameraError("");
    }

    return () => {
      stopCamera();
    };
  }, [cameraEnabled]);

  const suggestedAction = todayData?.suggested_action || "scan_in";

  const finalSuspicion = useMemo(() => {
    if (!gpsCollection.suspicionResult || !networkReady) return null;

    const networkPoints = calculateNetworkSuspicionPoints(networkCheck);
    const score = Math.max(0, Math.round((gpsCollection.suspicionResult.score || 0) + networkPoints));
    const flags = [
      ...(gpsCollection.suspicionResult.flags || []).map((f) => f.indicator),
      ...(networkPoints > 0
        ? [
            !networkCheck?.isOnCompanyNetwork
              ? "not_on_company_network"
              : "slow_internal_network",
          ]
        : []),
    ];

    return {
      score,
      flags: [...new Set(flags)],
    };
  }, [gpsCollection.suspicionResult, networkReady, networkCheck]);

  const finalSuspicionScore = finalSuspicion?.score ?? 0;
  const finalSuspicionFlags = finalSuspicion?.flags ?? [];

  const employeeLocationStatus: EmployeeLocationStatus = useMemo(() => {
    if (!gpsCollection.isReady || !networkReady || !finalSuspicion) return "collecting";
    if (finalSuspicion.score > 70) return "blocked";
    if (finalSuspicion.score >= 31) return "pending";
    return "verified";
  }, [gpsCollection.isReady, networkReady, finalSuspicion]);

  const employeeLocationStatusText = useMemo(() => {
    const labels = SCAN_I18N[lang];
    if (employeeLocationStatus === "collecting") return labels.collectingLocation;
    if (employeeLocationStatus === "verified") return labels.locationVerifiedFriendly;
    if (employeeLocationStatus === "pending") return labels.locationPendingFriendly;
    return labels.locationBlockedFriendly;
  }, [employeeLocationStatus, lang]);

  const canScan = Boolean(locationCheck?.inside)
    && !locationCheck?.suspicious_gps
    && suggestedAction !== "completed"
    && employeeLocationStatus !== "collecting"
    && employeeLocationStatus !== "blocked";

  const statusLabel = useMemo(() => {
    if (!locationCheck) return SCAN_I18N[lang].statusWaiting;
    if (locationCheck.suspicious_gps) return SCAN_I18N[lang].statusSuspicious;
    if (locationCheck.inside) return SCAN_I18N[lang].statusInside;
    return SCAN_I18N[lang].statusOutside;
  }, [locationCheck, lang]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const latestRecord = useMemo(() => {
    if (!todayData?.history?.length) return null;
    return todayData.history.reduce((latest: any, item: any) => {
      if (!latest) return item;
      return new Date(item.time).getTime() > new Date(latest.time).getTime() ? item : latest;
    }, null);
  }, [todayData]);

  const firstScanIn = useMemo(() => {
    const h = todayData?.history;
    if (!h?.length) return null;
    const ins = h
      .filter((x: { type: string }) => x.type === "scan_in")
      .sort(
        (a: { time: string }, b: { time: string }) =>
          new Date(a.time).getTime() - new Date(b.time).getTime(),
      );
    return ins[0] || null;
  }, [todayData]);

  const timelineSorted = useMemo(() => {
    if (!todayData?.history?.length) return [];
    return [...todayData.history].sort(
      (a: { time: string }, b: { time: string }) =>
        new Date(a.time).getTime() - new Date(b.time).getTime(),
    );
  }, [todayData]);

  const mapSrc = gps
    ? `https://maps.google.com/maps?q=${gps.latitude},${gps.longitude}&z=16&output=embed`
    : "";

  const areaOptions = locations?.length
    ? locations
    : [
        { id: "pit_a", name: "Pit A" },
        { id: "pit_b", name: "Pit B" },
        { id: "drilling", name: "Drilling" },
        { id: "workshop", name: "Workshop" },
      ];

  const T = SCAN_I18N[lang];
  const dateLocale = lang === "en" ? "en-US" : lang === "lo" ? "lo-LA" : "th-TH";

  const tabRaw = searchParams.get("tab") ?? "today";
  const tab = tabRaw === "history" || tabRaw === "leave" ? tabRaw : "today";
  const moParsed = Number.parseInt(searchParams.get("mo") ?? "0", 10);
  const monthOffset = Number.isFinite(moParsed) ? moParsed : 0;
  const shiftFilter = searchParams.get("filter") || "all";
  const leaveView = searchParams.get("leaveView") === "month" ? "month" : "year";
  const lyParsed = Number.parseInt(searchParams.get("ly") ?? "0", 10);
  const leaveYearOffset = Number.isFinite(lyParsed) ? lyParsed : 0;
  const lmParsed = Number.parseInt(searchParams.get("lm") ?? "0", 10);
  const leaveMonthOffset = Number.isFinite(lmParsed) ? lmParsed : 0;

  const checkInTimeDisplay = firstScanIn
    ? new Date(firstScanIn.time).toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "—";

  const showSkeleton = !todayLoaded;

  const pendingScanOut =
    timelineSorted.length > 0 &&
    timelineSorted[timelineSorted.length - 1]?.type === "scan_in";

  const scanPrimaryLabel =
    busy ? T.scanning : suggestedAction === "scan_out" ? "บันทึกออกงาน" : "บันทึกเข้างาน";

  return (
    <main className="pb-4 pt-1 text-[#111111]">
      <div className="mb-4 flex gap-1 rounded-xl bg-[#F4F4F6] p-1">
        {(
          [
            { id: "today" as const, label: "วันนี้" },
            { id: "history" as const, label: "ประวัติการทำงาน" },
            { id: "leave" as const, label: "สรุปการลา" },
          ] as const
        ).map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() =>
              setSearchParams(
                (prev) => {
                  const n = new URLSearchParams(prev);
                  n.set("tab", id);
                  return n;
                },
                { replace: true },
              )
            }
            className={`min-w-0 flex-1 rounded-lg py-2 text-center text-[13px] font-semibold transition ${
              tab === id ? "bg-white text-[#0D0D0D] shadow-[0_1px_4px_rgba(0,0,0,0.08)]" : "text-[#9898AA]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "today" ? (
        <>
          {todayLoaded && !todayData && feedback.type === "error" ? (
            <div className="rounded-[20px] border border-red-200 bg-red-50 p-6 text-center">
              <p className="text-sm font-semibold text-red-700">{feedback.message || SCAN_I18N[lang].loadFailed}</p>
              <button
                type="button"
                onClick={() => {
                  setTodayLoaded(false);
                  setFeedback({ type: "", message: "" });
                  loadToday().catch((err: unknown) => {
                    setFeedback({ type: "error", message: err instanceof Error ? err.message : SCAN_I18N[lang].loadFailed });
                  });
                }}
                className="mt-3 rounded-xl bg-gradient-to-br from-[#B00030] to-[#E8193A] px-6 py-2.5 text-sm font-bold text-white shadow-sm transition active:scale-[0.97]"
              >
                ลองใหม่
              </button>
            </div>
          ) : null}

          <div className={`rounded-[20px] border border-black/[0.07] bg-white px-5 py-7 text-center ${todayLoaded && !todayData ? "hidden" : ""}`}>
            <div
              className={`relative mx-auto flex size-[90px] items-center justify-center rounded-full ${
                showSkeleton ? "bg-[#F4F4F6] animate-pulse" : "bg-gradient-to-br from-[#FFF0F3] to-[#FECDD6]"
              }`}
              aria-hidden={showSkeleton}
            >
              {showSkeleton ? (
                <div className="size-[42px] rounded-full bg-white/60" />
              ) : (
                <>
                  <div
                    className="pointer-events-none absolute inset-[-5px] rounded-full border-2 border-dashed border-[#FECDD6] animate-spin [animation-duration:12s]"
                    aria-hidden
                  />
                  <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke="#D0002A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                    <circle cx="12" cy="10" r="3" />
                  </svg>
                </>
              )}
            </div>

            {showSkeleton ? (
              <div className="mx-auto mt-3.5 h-6 w-[245px] animate-pulse rounded-full bg-[#F4F4F6]" aria-hidden />
            ) : (
              <div className="mt-3.5 inline-flex items-center gap-1.5 rounded-full bg-[#EDFBF4] px-3 py-1.5 text-[11px] font-semibold text-[#00B96B]">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
                </svg>
                สำนักงานใหญ่ — ตรวจพบแล้ว
              </div>
            )}

            {showSkeleton ? (
              <>
                <div className="mt-4 h-4 w-[160px] animate-pulse rounded bg-[#F4F4F6]" aria-hidden />
                <div className="mt-1 h-8 w-[190px] animate-pulse rounded bg-[#F4F4F6]" aria-hidden />
              </>
            ) : (
              <>
                <p className="mt-4 text-[13px] text-[#9898AA]">เข้างานวันนี้</p>
                <p className="mt-1 text-[28px] font-bold leading-none tracking-[-1px] text-[#0D0D0D]">
                  {checkInTimeDisplay === "—" ? "—" : `${checkInTimeDisplay} น.`}
                </p>
              </>
            )}
            {showSkeleton ? (
              <>
                <div className="mt-5 h-[60px] w-full animate-pulse rounded-[14px] bg-[#F4F4F6]" aria-hidden />
                <div className="mt-2.5 h-[54px] w-full animate-pulse rounded-[14px] border border-[#FECDD6] bg-white" aria-hidden />
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => void handleScan()}
                  disabled={busy || !canScan}
                  className={`mt-5 w-full rounded-[14px] py-[15px] text-[15px] font-bold tracking-[-0.2px] transition active:scale-[0.98] disabled:opacity-60 ${
                    !canScan
                      ? "bg-[#333333] text-white"
                      : "bg-gradient-to-br from-[#B00030] to-[#E8193A] text-white shadow-[0_4px_16px_rgba(176,0,48,0.28)]"
                  }`}
                >
                  {scanPrimaryLabel}
                </button>
                <button
                  type="button"
                  className="mt-2.5 w-full rounded-[14px] border-[1.5px] border-[#FECDD6] bg-transparent py-3.5 text-[14px] font-semibold text-[#D0002A] transition active:bg-[#FFF0F3]"
                >
                  สแกน QR Code แทน
                </button>
              </>
            )}
          </div>

          <h3 className={`mb-2 mt-5 text-xs font-bold uppercase tracking-[0.8px] text-[#9898AA] ${todayLoaded && !todayData ? "hidden" : ""}`}>ไทม์ไลน์วันนี้</h3>
          <div className={`rounded-[20px] border border-black/[0.07] bg-white px-4 py-3 ${todayLoaded && !todayData ? "hidden" : ""}`}>
            <div className="flex flex-col">
              {showSkeleton ? (
                <>
                  {Array.from({ length: 3 }).map((_, idx) => (
                    <div key={idx} className="flex min-h-[52px] gap-3.5 py-2">
                      <div className="flex w-4 shrink-0 flex-col items-center">
                        <div className="z-[1] size-3 shrink-0 rounded-full bg-[#F4F4F6] animate-pulse" aria-hidden />
                        <div className="mt-0.5 w-[1.5px] flex-1 grow rounded-full bg-[#F4F4F6] animate-pulse" aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1 pb-3 pt-0.5 border-b border-black/[0.07]">
                        <div className="h-4 w-[55%] animate-pulse rounded bg-[#F4F4F6]" aria-hidden />
                        <div className="mt-2 h-3 w-[70%] animate-pulse rounded bg-[#F4F4F6]" aria-hidden />
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <>
                  {timelineSorted.map((item: { type: string; time: string }, idx: number) => {
                    const isIn = item.type === "scan_in";
                    const isLast = idx === timelineSorted.length - 1;
                    const lineDown = !isLast || pendingScanOut;
                    const borderBelow = !isLast || pendingScanOut;
                    return (
                      <div key={`${item.type}-${idx}`} className="flex min-h-[52px] gap-3.5 py-2">
                        <div className="flex w-4 shrink-0 flex-col items-center">
                          <div
                            className={`z-[1] size-3 shrink-0 rounded-full ${isIn ? "bg-[#00B96B] shadow-[0_0_0_3px_#EDFBF4]" : "bg-[#9898AA] shadow-[0_0_0_3px_#F4F4F6]"}`}
                          />
                          {lineDown ? (
                            <div className="mt-0.5 w-[1.5px] flex-1 grow bg-black/[0.07]" aria-hidden />
                          ) : null}
                        </div>
                        <div
                          className={`min-w-0 flex-1 pb-3 pt-0.5 ${borderBelow ? "border-b border-black/[0.07]" : ""}`}
                        >
                          <p className="text-sm font-semibold text-[#0D0D0D]">{isIn ? T.scanIn : T.scanOut}</p>
                          <p className="mt-0.5 text-xs text-[#9898AA]">
                            {new Date(item.time).toLocaleTimeString("en-GB", {
                              hour: "2-digit",
                              minute: "2-digit",
                              hour12: false,
                            })}{" "}
                            น. · GPS
                          </p>
                        </div>
                      </div>
                    );
                  })}
                  {pendingScanOut ? (
                    <div className="flex gap-3.5 py-3">
                      <div className="flex flex-col items-center pt-0.5">
                        <div className="size-3 shrink-0 rounded-full bg-[#9898AA] shadow-[0_0_0_3px_#F4F4F6]" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-[#9898AA]">{T.scanOut}</p>
                        <p className="mt-0.5 text-xs text-[#9898AA]">ยังไม่ได้บันทึก</p>
                      </div>
                    </div>
                  ) : null}
                  {!timelineSorted.length && !pendingScanOut ? (
                    <p className="py-4 text-center text-sm text-[#9898AA]">{T.noHistory}</p>
                  ) : null}
                </>
              )}
            </div>
          </div>

          {feedback.message && todayData ? (
            <div
              className={`mt-3 rounded-xl border px-3 py-2 text-sm ${
                feedback.type === "success"
                  ? "border-green-200 bg-green-50 text-green-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {feedback.message}
            </div>
          ) : null}

          <details className={`group mt-4 rounded-2xl border border-black/[0.07] bg-white open:shadow-sm ${todayLoaded && !todayData ? "hidden" : ""}`}>
            <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-[#0D0D0D] marker:content-none [&::-webkit-details-marker]:hidden">
              <span className="flex items-center justify-between gap-2">
                ตั้งค่า GPS พื้นที่ทำงาน และเซลฟี่
                <span className="text-[#9898AA] transition group-open:rotate-180">▼</span>
              </span>
            </summary>
            <div className="space-y-3 border-t border-black/[0.06] px-4 pb-4 pt-3">
              <section className="rounded-xl border border-[#FECACA] bg-white p-3">
                {showSkeleton ? (
                  <div className="space-y-2">
                    <div className="h-4 w-1/2 animate-pulse rounded bg-[#F4F4F6]" aria-hidden />
                    <div className="h-5 w-[72%] animate-pulse rounded bg-[#F4F4F6]" aria-hidden />
                    <div className="h-4 w-[68%] animate-pulse rounded bg-[#F4F4F6]" aria-hidden />
                    <div className="h-4 w-[84%] animate-pulse rounded bg-[#F4F4F6]" aria-hidden />
                  </div>
                ) : (
                  <>
                    <h2 className="text-base font-bold text-[#111111]">{T.employeeInfo}</h2>
                    <p className="mt-1 text-base text-[#555555]">{todayData?.employee?.name || "-"}</p>
                    <p className="text-sm text-[#555555]">EMP: {todayData?.employee?.employee_code || loaderData.empId}</p>
                    <p className="mt-2 text-sm text-[#D62828]">
                      {todayData?.shift_name || "Shift"} {todayData?.shift_time ? `(${todayData.shift_time})` : ""}
                    </p>
                  </>
                )}
              </section>

              <section className="rounded-xl border border-[#FECACA] bg-white p-3">
                {showSkeleton ? (
                  <div className="space-y-2">
                    <div className="h-4 w-1/3 animate-pulse rounded bg-[#F4F4F6]" aria-hidden />
                    <div className="flex items-center justify-between gap-2">
                      <div className="h-6 w-[60%] animate-pulse rounded bg-[#F4F4F6]" aria-hidden />
                      <div className="h-9 w-[90px] animate-pulse rounded bg-[#F4F4F6]" aria-hidden />
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-[#555555]">{T.date}</p>
                      <p className="mt-1 text-xl font-bold text-[#111111]">{now.toLocaleDateString(dateLocale)}</p>
                    </div>
                    <div className="text-[1.5rem] font-extrabold leading-none text-[#111111]">
                      {now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}
                    </div>
                  </div>
                )}
              </section>

              <section className="rounded-xl border border-[#FECACA] bg-white p-3">
                {showSkeleton ? (
                  <div className="space-y-2">
                    <div className="h-5 w-[55%] animate-pulse rounded bg-[#F4F4F6]" aria-hidden />
                    <div className="h-10 w-full animate-pulse rounded bg-[#F4F4F6]" aria-hidden />
                  </div>
                ) : (
                  <>
                    <h3 className="mb-2 text-base font-bold text-[#111111]">{T.workplace}</h3>
                    <select
                      value={selectedWorkArea}
                      onChange={(e) => setSelectedWorkArea(e.target.value)}
                      className="w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-base text-[#111111]"
                    >
                      <option value="">{T.selectArea}</option>
                      {areaOptions.map((item, idx) => {
                        const label = item.name || item.location_name || item.area_name || `Area ${idx + 1}`;
                        const value = item.id || label;
                        return (
                          <option key={`${value}-${idx}`} value={label}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  </>
                )}
              </section>

              <section className="rounded-xl border border-[#FECACA] bg-white p-3">
                {showSkeleton ? (
                  <div className="space-y-3">
                    <div className="h-5 w-[45%] animate-pulse rounded bg-[#F4F4F6]" aria-hidden />
                    <div className="space-y-2 rounded-xl border border-[#FECACA] bg-white p-3">
                      <div className="h-4 w-[65%] animate-pulse rounded bg-[#F4F4F6]" aria-hidden />
                      <div className="h-4 w-[80%] animate-pulse rounded bg-[#F4F4F6]" aria-hidden />
                      <div className="h-4 w-[55%] animate-pulse rounded bg-[#F4F4F6]" aria-hidden />
                      <div className="h-4 w-[72%] animate-pulse rounded bg-[#F4F4F6]" aria-hidden />
                    </div>
                    <div className="h-36 w-full animate-pulse rounded-xl bg-[#F4F4F6]" aria-hidden />
                  </div>
                ) : (
                  <>
                    <h3 className="mb-2 text-base font-bold text-[#111111]">{T.gpsStatus}</h3>
                    <div className="rounded-xl border border-[#FECACA] bg-white p-3 text-sm text-[#444444]">
                      <p>
                        <span className="font-semibold">{T.statusLabel}:</span> {statusLabel}
                      </p>
                      <p className="mt-1">
                        <span className="font-semibold">{T.locationVerificationStatus}:</span> {employeeLocationStatusText}
                      </p>
                      {gpsCollection.isCollecting ? (
                        <p className="mt-1 text-xs text-[#555555]">{gpsCollection.progress}/5</p>
                      ) : null}
                      <p className="mt-1">
                        <span className="font-semibold">{T.nearest}:</span>{" "}
                        {locationCheck?.nearest?.name || selectedWorkArea || "-"}
                      </p>
                      <p className="mt-1">
                        <span className="font-semibold">{T.coords}:</span>{" "}
                        {gps ? `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}` : "-"}
                      </p>
                    </div>
                    <div className="mt-3 overflow-hidden rounded-xl border border-[#FECACA]">
                      {gps ? (
                        <iframe title="scan-map" src={mapSrc} className="h-36 w-full" />
                      ) : (
                        <div className="flex h-36 items-center justify-center bg-[#FEF2F2] text-sm text-[#555555]">
                          {T.mapPlaceholder}
                        </div>
                      )}
                    </div>
                    {gpsError ? <p className="mt-2 text-sm text-red-600">{gpsError}</p> : null}
                    {locationCheck?.suspicious_reasons?.length ? (
                      <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                        {T.suspicious}: {locationCheck.suspicious_reasons.join(", ")}
                      </p>
                    ) : null}
                  </>
                )}
              </section>

              <button
                type="button"
                onClick={() => void refreshGps()}
                disabled={showSkeleton}
                className={`w-full rounded-xl py-3 text-base font-extrabold shadow-[0_8px_14px_rgba(220,38,38,0.3)] transition ${
                  showSkeleton
                    ? "bg-[#F4F4F6] text-transparent animate-pulse"
                    : "bg-gradient-to-b from-[#DC2626] to-[#991B1B] text-white hover:brightness-105 active:translate-y-px"
                }`}
              >
                {T.refreshGps}
              </button>

              <section className="rounded-xl border border-[#FECACA] bg-white p-3">
                {showSkeleton ? (
                  <div className="space-y-2">
                    <div className="h-5 w-[45%] animate-pulse rounded bg-[#F4F4F6]" aria-hidden />
                    <div className="h-9 w-full animate-pulse rounded-xl bg-[#F4F4F6]" aria-hidden />
                  </div>
                ) : (
                  <>
                    <h3 className="mb-2 text-base font-bold text-[#111111]">{T.latestScan}</h3>
                    <div className="rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-base text-[#444444]">
                      {latestRecord
                        ? `${latestRecord.type === "scan_out" ? T.scanOut : T.scanIn} ${new Date(latestRecord.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}`
                        : T.noHistory}
                    </div>
                  </>
                )}
              </section>

              <section className="rounded-xl border border-[#FECACA] bg-white p-3">
                {showSkeleton ? (
                  <div className="space-y-2">
                    <div className="h-5 w-[72%] animate-pulse rounded bg-[#F4F4F6]" aria-hidden />
                    <div className="h-4 w-[88%] animate-pulse rounded bg-[#F4F4F6]" aria-hidden />
                    <div className="h-24 w-full animate-pulse rounded-xl bg-[#F4F4F6]" aria-hidden />
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2 text-sm text-[#111111]">
                      <input
                        id="camera-optional"
                        type="checkbox"
                        checked={cameraEnabled}
                        onChange={(e) => setCameraEnabled(e.target.checked)}
                      />
                      <label htmlFor="camera-optional">{T.faceOptional}</label>
                    </div>
                    <p className="mt-1 text-xs text-[#555555]">{T.faceNote}</p>
                    {cameraEnabled ? (
                      <div className="mt-2 space-y-2 rounded-xl border border-[#FECACA] bg-white p-3">
                        <video ref={videoRef} className="max-h-64 w-full rounded-lg bg-black" muted playsInline />
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={takeSelfie}
                            className="rounded-lg border border-[#DC2626] px-3 py-1.5 text-sm text-[#DC2626]"
                          >
                            {T.captureSelfie}
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelfieDataUrl(null)}
                            className="rounded-lg border border-[#FECACA] px-3 py-1.5 text-sm text-[#444444]"
                          >
                            {T.retakeSelfie}
                          </button>
                        </div>
                        {selfieDataUrl ? (
                          <img
                            src={selfieDataUrl}
                            alt="selfie-preview"
                            className="h-36 w-36 rounded-lg border border-[#FECACA] object-cover"
                          />
                        ) : null}
                        {cameraError ? <p className="text-xs text-red-600">{cameraError}</p> : null}
                      </div>
                    ) : null}
                  </>
                )}
              </section>
            </div>
          </details>
        </>
      ) : null}

      {tab === "history" ? (
        <ScanHistoryTab monthOffset={monthOffset} shiftFilter={shiftFilter} setSearchParams={setSearchParams} />
      ) : null}

      {tab === "leave" ? (
        <ScanLeaveTab
          leaveView={leaveView}
          leaveYearOffset={leaveYearOffset}
          leaveMonthOffset={leaveMonthOffset}
          setSearchParams={setSearchParams}
        />
      ) : null}
    </main>
  );
}
