import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/scan";
import { requireSession } from "~/lib/require-session.server";

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

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function loadToday() {
    const [todayRes, locationRes] = await Promise.all([
      fetch("/api/attendance/today"),
      fetch("/api/work-locations"),
    ]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const todayJson: any = await todayRes.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const locationJson: any = await locationRes.json();

    if (!todayRes.ok) throw new Error(todayJson.error || "LOAD_TODAY_FAILED");

    setTodayData(todayJson);
    setLocations(locationJson.rows || []);
  }

  async function verifyLocation(position: GpsState, clientFlags: string[] = []) {
    const res = await fetch("/api/attendance/verify-location", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      setGpsError("อุปกรณ์ไม่รองรับ GPS");
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
      setGpsError("ไม่สามารถอ่านตำแหน่ง GPS ได้");
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
        setCameraError("อุปกรณ์ไม่รองรับกล้อง");
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
      setCameraError(err instanceof Error ? err.message : "ไม่สามารถเปิดกล้องได้");
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
      setFeedback({ type: "error", message: "กรุณาตรวจสอบตำแหน่ง GPS ก่อน" });
      return;
    }

    setBusy(true);
    setFeedback({ type: "", message: "" });

    try {
      let selfieUrl: string | null = null;

      if (cameraEnabled && selfieDataUrl) {
        setFeedback({ type: "", message: "กำลังอัปโหลดรูปถ่าย..." });
        selfieUrl = await uploadSelfieToCloudinary(selfieDataUrl, "tdone-attendance/scan");
      }

      const res = await fetch("/api/attendance/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          latitude: gps.latitude,
          longitude: gps.longitude,
          accuracy: gps.accuracy,
          captured_at: new Date(gps.timestamp).toISOString(),
          fake_flags: collectGpsFlags(gps),
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
        message: data.action === "scan_in" ? "สแกนเข้าเรียบร้อย" : "สแกนออกเรียบร้อย",
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
      setFeedback({ type: "error", message: err instanceof Error ? err.message : "LOAD_TODAY_FAILED" });
    });
  }, []);

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
  const canScan = Boolean(locationCheck?.inside) && !locationCheck?.suspicious_gps && suggestedAction !== "completed";

  const statusLabel = useMemo(() => {
    if (!locationCheck) return "ยังไม่ได้ตรวจสอบ";
    if (locationCheck.suspicious_gps) return "ตำแหน่งน่าสงสัย";
    if (locationCheck.inside) return "อยู่ในพื้นที่ทำงาน";
    return "อยู่นอกพื้นที่ทำงาน";
  }, [locationCheck]);

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

  if (!todayData) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white text-[#111111]">
        <p>กำลังโหลดข้อมูลสแกน...</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-white px-3 pb-6 pt-4 text-[#111111] sm:px-6">
      <div className="mx-auto w-full max-w-md rounded-[28px] border border-[#FECACA] bg-white p-4 shadow-[0_16px_40px_rgba(220,38,38,0.12)] sm:p-5">
        <header className="mb-3 flex items-center justify-between gap-2">
          <h1 className="text-[1.8rem] font-extrabold tracking-tight text-[#111111]">บันทึกเวลาเข้างาน</h1>
          <Link to="/dashboard" className="rounded-lg border border-[#FECACA] px-3 py-1.5 text-sm font-semibold text-[#991B1B]">
            กลับ
          </Link>
        </header>

        <section className="rounded-2xl border border-[#FECACA] bg-white p-3 shadow-[0_10px_24px_rgba(0,0,0,0.2)]">
          <h2 className="text-[1.1rem] font-bold text-[#111111]">พนักงาน</h2>
          <p className="mt-1 text-base text-[#555555]">{todayData.employee?.name || "-"}</p>
          <p className="text-sm text-[#555555]">EMP: {todayData.employee?.employee_code || loaderData.empId}</p>
          <p className="mt-2 text-sm text-[#D62828]">{todayData.shift_name || "Shift"} {todayData.shift_time ? `(${todayData.shift_time})` : ""}</p>
        </section>

        <section className="mt-3 rounded-2xl border border-[#FECACA] bg-white p-3 shadow-[0_10px_24px_rgba(0,0,0,0.2)]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-[#555555]">วันที่</p>
              <p className="mt-1 text-xl font-bold text-[#111111]">{now.toLocaleDateString("th-TH")}</p>
            </div>
            <div className="text-[2.1rem] font-extrabold leading-none text-[#111111]">
              {now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}
            </div>
          </div>
        </section>

        <section className="mt-3 rounded-2xl border border-[#FECACA] bg-white p-3 shadow-sm">
          <h3 className="mb-2 text-base font-bold text-[#111111]">พื้นที่ทำงาน</h3>
          <select
            value={selectedWorkArea}
            onChange={(e) => setSelectedWorkArea(e.target.value)}
            className="w-full rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-base text-[#111111]"
          >
            <option value="">เลือกพื้นที่</option>
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
          <h3 className="mb-2 text-base font-bold text-[#111111]">สถานะ GPS</h3>
          <div className="rounded-xl border border-[#FECACA] bg-white p-3 text-sm text-[#444444]">
            <p><span className="font-semibold">สถานะ:</span> {statusLabel}</p>
            <p className="mt-1"><span className="font-semibold">จุดใกล้สุด:</span> {locationCheck?.nearest?.name || selectedWorkArea || "-"}</p>
            <p className="mt-1"><span className="font-semibold">พิกัด:</span> {gps ? `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}` : "-"}</p>
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-[#FECACA]">
            {gps ? (
              <iframe title="scan-map" src={mapSrc} className="h-36 w-full" />
            ) : (
              <div className="flex h-36 items-center justify-center bg-[#FEF2F2] text-sm text-[#555555]">
                กรุณาตรวจสอบตำแหน่ง GPS
              </div>
            )}
          </div>

          {gpsError ? <p className="mt-2 text-sm text-red-600">{gpsError}</p> : null}
          {locationCheck?.suspicious_reasons?.length ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
              พบความผิดปกติ: {locationCheck.suspicious_reasons.join(", ")}
            </p>
          ) : null}
        </section>

        <button
          type="button"
          onClick={() => void refreshGps()}
          className="mt-3 w-full rounded-xl bg-gradient-to-b from-[#DC2626] to-[#991B1B] py-3 text-[1.2rem] font-extrabold text-white shadow-[0_8px_14px_rgba(220,38,38,0.3)] transition hover:brightness-105 active:translate-y-[1px]"
        >
          ตรวจสอบตำแหน่ง GPS
        </button>

        <section className="mt-3 rounded-2xl border border-[#FECACA] bg-white p-3 shadow-sm">
          <h3 className="mb-2 text-base font-bold text-[#111111]">ลงเวลาล่าสุด</h3>
          <div className="rounded-xl border border-[#FECACA] bg-white px-3 py-2 text-base text-[#444444]">
            {latestRecord
              ? `${latestRecord.type === "scan_out" ? "สแกนออก" : "สแกนเข้า"} ${new Date(latestRecord.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}`
              : "ยังไม่มีประวัติในวันนี้"}
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
            <label htmlFor="camera-optional">เปิดกล้องเพื่อแนบรูปถ่าย (ไม่บังคับ)</label>
          </div>
          <p className="mt-1 text-xs text-[#555555]">ถ้าเปิดกล้อง ให้กดถ่ายรูปก่อนสแกนเพื่อแนบหลักฐาน</p>

          {cameraEnabled ? (
            <div className="mt-2 space-y-2 rounded-xl border border-[#FECACA] bg-white p-3">
              <video ref={videoRef} className="max-h-64 w-full rounded-lg bg-black" muted playsInline />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={takeSelfie} className="rounded-lg border border-[#DC2626] px-3 py-1.5 text-sm text-[#DC2626]">ถ่ายรูป</button>
                <button type="button" onClick={() => setSelfieDataUrl(null)} className="rounded-lg border border-[#FECACA] px-3 py-1.5 text-sm text-[#444444]">ถ่ายใหม่</button>
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
          {busy ? "กำลังบันทึก..." : suggestedAction === "scan_out" ? "สแกนออก" : "สแกนเข้า"}
        </button>

        {feedback.message ? (
          <div className={`mt-3 rounded-xl border px-3 py-2 text-sm ${feedback.type === "success" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
            {feedback.message}
          </div>
        ) : null}

        {todayData.history?.length ? (
          <section className="mt-3 rounded-2xl border border-[#FECACA] bg-white p-3 shadow-[0_10px_24px_rgba(0,0,0,0.2)]">
            <h2 className="mb-2 text-sm font-bold text-[#111111]">ประวัติวันนี้</h2>
            <div className="space-y-2">
              {todayData.history.map((item: { type: string; time: string }, idx: number) => (
                <div key={`${item.type}-${idx}`} className="rounded-lg border border-[#FECACA] p-2 text-sm text-[#444444]">
                  <p className="font-semibold">{item.type === "scan_in" ? "สแกนเข้า" : "สแกนออก"}</p>
                  <p>เวลา: {new Date(item.time).toLocaleString("th-TH")}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
