import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/scan";
import { requireSession } from "~/lib/require-session.server";
import { setDeviceIdCookie } from "~/lib/device-id";
import { useGPSCollection } from "@/lib/useGPSCollection";
import { checkInternalNetwork, type NetworkCheckResult } from "@/lib/gpsSpoofingDetection";

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
  const key = "tdone_device_id";
  const existing = localStorage.getItem(key);
  if (existing) return existing;

  const raw = [
    navigator.userAgent,
    navigator.language,
    navigator.platform,
    String(navigator.hardwareConcurrency || ""),
    String(navigator.maxTouchPoints || ""),
  ].join("|");

  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = ((hash << 5) - hash) + raw.charCodeAt(i);
    hash |= 0;
  }

  const id = `dev_${Math.abs(hash)}_${Date.now().toString(36)}`;
  localStorage.setItem(key, id);
  setDeviceIdCookie(id);
  return id;
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
  const [lang, setLang] = useState<LangCode>("th");
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

  useEffect(() => {
    const saved = localStorage.getItem("tdone_lang");
    if (saved === "th" || saved === "en" || saved === "lo") {
      setLang(saved);
    }
  }, []);

  function changeLanguage(next: LangCode) {
    setLang(next);
    localStorage.setItem("tdone_lang", next);
  }

  function attendanceHeaders(extra?: Record<string, string>) {
    return extra || {};
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
    const [todayRes, locationRes] = await Promise.all([
      fetch("/api/attendance/today", { headers: attendanceHeaders() }),
      fetch("/api/work-locations", { headers: attendanceHeaders() }),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const todayJson: any = await todayRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const locationJson: any = await locationRes.json();

    if (!todayRes.ok) throw new Error(todayJson.error || SCAN_I18N[lang].loadFailed);

    setTodayData(todayJson);
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

  if (!todayData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-[#111111]">
        <p>{T.loading}</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-white px-3 pb-6 pt-4 text-[#111111] sm:px-6">
      <div className="mx-auto w-full max-w-md rounded-[28px] border border-[#FECACA] bg-white p-4 shadow-[0_16px_40px_rgba(220,38,38,0.12)] sm:p-5">
        <header className="mb-3 flex items-center justify-between gap-2">
          <h1 className="text-[1.8rem] font-extrabold tracking-tight text-[#111111]">{T.title}</h1>
          <div className="flex items-center gap-1">
            {(["th", "en", "lo"] as LangCode[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => changeLanguage(code)}
                className={`rounded-full border px-2 py-1 text-[10px] font-bold transition ${
                  lang === code
                    ? "border-[#DC2626] bg-[#DC2626] text-white"
                    : "border-[#FECACA] bg-white text-[#555555]"
                }`}
              >
                {code.toUpperCase()}
              </button>
            ))}
          </div>
          <Link to="/dashboard" className="rounded-lg border border-[#FECACA] px-3 py-1.5 text-sm font-semibold text-[#991B1B]">
            {T.back}
          </Link>
        </header>

        <section className="rounded-2xl border border-[#FECACA] bg-white p-3 shadow-[0_10px_24px_rgba(0,0,0,0.2)]">
          <h2 className="text-[1.1rem] font-bold text-[#111111]">{T.employeeInfo}</h2>
          <p className="mt-1 text-base text-[#555555]">{todayData.employee?.name || "-"}</p>
          <p className="text-sm text-[#555555]">EMP: {todayData.employee?.employee_code || loaderData.empId}</p>
          <p className="mt-2 text-sm text-[#D62828]">{todayData.shift_name || "Shift"} {todayData.shift_time ? `(${todayData.shift_time})` : ""}</p>
        </section>

        <section className="mt-3 rounded-2xl border border-[#FECACA] bg-white p-3 shadow-[0_10px_24px_rgba(0,0,0,0.2)]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-[#555555]">{T.date}</p>
              <p className="mt-1 text-xl font-bold text-[#111111]">{now.toLocaleDateString(dateLocale)}</p>
            </div>
            <div className="text-[2.1rem] font-extrabold leading-none text-[#111111]">
              {now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}
            </div>
          </div>
        </section>

        <section className="mt-3 rounded-2xl border border-[#FECACA] bg-white p-3 shadow-sm">
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
                <option key={`${value}-${idx}`} value={label}>{label}</option>
              );
            })}
          </select>
        </section>

        <section className="mt-3 rounded-2xl border border-[#FECACA] bg-white p-3 shadow-sm">
          <h3 className="mb-2 text-base font-bold text-[#111111]">{T.gpsStatus}</h3>
          <div className="rounded-xl border border-[#FECACA] bg-white p-3 text-sm text-[#444444]">
            <p><span className="font-semibold">{T.statusLabel}:</span> {statusLabel}</p>
            <p className="mt-1"><span className="font-semibold">{T.locationVerificationStatus}:</span> {employeeLocationStatusText}</p>
            {gpsCollection.isCollecting ? (
              <p className="mt-1 text-xs text-[#555555]">{gpsCollection.progress}/5</p>
            ) : null}
            <p className="mt-1"><span className="font-semibold">{T.nearest}:</span> {locationCheck?.nearest?.name || selectedWorkArea || "-"}</p>
            <p className="mt-1"><span className="font-semibold">{T.coords}:</span> {gps ? `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}` : "-"}</p>
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
        </section>

        <button
          type="button"
          onClick={() => void refreshGps()}
          className="mt-3 w-full rounded-xl bg-gradient-to-b from-[#DC2626] to-[#991B1B] py-3 text-[1.2rem] font-extrabold text-white shadow-[0_8px_14px_rgba(220,38,38,0.3)] transition hover:brightness-105 active:translate-y-[1px]"
        >
          {T.refreshGps}
        </button>

        <section className="mt-3 rounded-2xl border border-[#FECACA] bg-white p-3 shadow-sm">
          <h3 className="mb-2 text-base font-bold text-[#111111]">{T.latestScan}</h3>
          <div className="rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-base text-[#444444]">
            {latestRecord
              ? `${latestRecord.type === "scan_out" ? T.scanOut : T.scanIn} ${new Date(latestRecord.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}`
              : T.noHistory}
          </div>
        </section>

        <section className="mt-3 rounded-2xl border border-[#FECACA] bg-white p-3 shadow-sm">
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
                <button type="button" onClick={takeSelfie} className="rounded-lg border border-[#DC2626] px-3 py-1.5 text-sm text-[#DC2626]">{T.captureSelfie}</button>
                <button type="button" onClick={() => setSelfieDataUrl(null)} className="rounded-lg border border-[#FECACA] px-3 py-1.5 text-sm text-[#444444]">{T.retakeSelfie}</button>
              </div>
              {selfieDataUrl ? <img src={selfieDataUrl} alt="selfie-preview" className="h-36 w-36 rounded-lg border border-[#FECACA] object-cover" /> : null}
              {cameraError ? <p className="text-xs text-red-600">{cameraError}</p> : null}
            </div>
          ) : null}
        </section>

        <button
          type="button"
          onClick={() => void handleScan()}
          disabled={busy || !canScan}
          className={`mt-3 w-full rounded-2xl py-3 text-[1.4rem] font-extrabold text-white transition hover:brightness-105 active:translate-y-[1px] ${
            !canScan
              ? "bg-[#333333]"
              : "bg-gradient-to-b from-[#DC2626] to-[#991B1B] shadow-[0_10px_16px_rgba(220,38,38,0.32)]"
          }`}
        >
          {busy ? T.scanning : suggestedAction === "scan_out" ? T.scanOut : T.scanIn}
        </button>

        {feedback.message ? (
          <div className={`mt-3 rounded-xl border px-3 py-2 text-sm ${feedback.type === "success" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
            {feedback.message}
          </div>
        ) : null}

        {todayData.history?.length ? (
          <section className="mt-3 rounded-2xl border border-[#FECACA] bg-white p-3 shadow-[0_10px_24px_rgba(0,0,0,0.2)]">
            <h2 className="mb-2 text-sm font-bold text-[#111111]">{T.todayHistory}</h2>
            <div className="space-y-2">
              {todayData.history.map((item: { type: string; time: string }, idx: number) => (
                <div key={`${item.type}-${idx}`} className="rounded-lg border border-[#FECACA] p-2 text-sm text-[#444444]">
                  <p className="font-semibold">{item.type === "scan_in" ? T.scanIn : T.scanOut}</p>
                  <p>{T.timeLabel}: {new Date(item.time).toLocaleString(dateLocale)}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
