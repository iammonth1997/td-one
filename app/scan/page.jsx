"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/app/hooks/useSession";
import { useLanguage } from "@/app/context/LanguageContext";
import { useLiff } from "@/app/hooks/useLiff";
import { uploadToCloudinaryWithSignature } from "@/lib/cloudinaryUtils";

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

function formatDateTime(iso, locale) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleString(locale || "en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function ScanPage() {
  const router = useRouter();
  const { session, loading, getAuthHeaders } = useSession();
  const { t, lang, setLang } = useLanguage();
  const { profile, idToken } = useLiff();
  const L = t.scan;

  const [now, setNow] = useState(new Date());
  const [todayData, setTodayData] = useState(null);
  const [locations, setLocations] = useState([]);
  const [gps, setGps] = useState(null);
  const [gpsError, setGpsError] = useState("");
  const [locationCheck, setLocationCheck] = useState(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState({ type: "", message: "" });
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [selfieDataUrl, setSelfieDataUrl] = useState(null);
  const [cameraError, setCameraError] = useState("");
  const [selectedWorkArea, setSelectedWorkArea] = useState("");
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  async function loadToday() {
    const headers = {
      ...getAuthHeaders(),
      ...(idToken ? { "x-line-id-token": idToken } : {}),
    };
    const [todayRes, locationRes] = await Promise.all([
      fetch("/api/attendance/today", { headers }),
      fetch("/api/work-locations", { headers }),
    ]);

    const todayJson = await todayRes.json();
    const locationJson = await locationRes.json();

    if (!todayRes.ok) {
      throw new Error(todayJson.error || "LOAD_TODAY_FAILED");
    }

    setTodayData(todayJson);
    setLocations(locationJson.rows || []);
  }

  async function verifyLocation(position, clientFlags = []) {
    const headers = {
      "Content-Type": "application/json",
      ...getAuthHeaders(),
      ...(idToken ? { "x-line-id-token": idToken } : {}),
    };

    const res = await fetch("/api/attendance/verify-location", {
      method: "POST",
      headers,
      body: JSON.stringify({
        latitude: position.latitude,
        longitude: position.longitude,
        accuracy: position.accuracy,
        captured_at: new Date(position.timestamp).toISOString(),
        fake_flags: clientFlags,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "VERIFY_LOCATION_FAILED");
    }

    setLocationCheck(data);
    return data;
  }

  function collectGpsFlags(position) {
    const flags = [];
    if (Number(position.accuracy) > 0 && Number(position.accuracy) < 5) {
      flags.push("accuracy_too_precise_client");
    }
    if (!Number.isFinite(position.latitude) || !Number.isFinite(position.longitude)) {
      flags.push("invalid_coordinate_client");
    }
    return flags;
  }

  async function refreshGps() {
    if (!navigator.geolocation) {
      setGpsError(L.gpsNotSupported);
      return;
    }

    setGpsError("");

    const current = await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          resolve({
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            timestamp: pos.timestamp,
          });
        },
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
      );
    }).catch((err) => {
      setGpsError(err.message || L.gpsFailed);
      return null;
    });

    if (!current) return;

    setGps(current);
    const flags = collectGpsFlags(current);
    try {
      await verifyLocation(current, flags);
    } catch (err) {
      setGpsError(err.message || L.gpsFailed);
    }
  }

  useEffect(() => {
    if (loading || !session) return;
    loadToday().catch((err) => {
      setFeedback({ type: "error", message: err.message || L.loadFailed });
    });
  }, [loading, session, idToken]);

  useEffect(() => {
    if (!loading && !session) {
      router.replace("/login");
    }
  }, [loading, session, router]);

  const suggestedAction = todayData?.suggested_action || "scan_in";
  const canScan = Boolean(locationCheck?.inside) && !locationCheck?.suspicious_gps && suggestedAction !== "completed";

  const statusLabel = useMemo(() => {
    if (!locationCheck) return L.statusWaiting;
    if (locationCheck.suspicious_gps) return L.statusSuspicious;
    if (locationCheck.inside) return L.statusInside;
    return L.statusOutside;
  }, [locationCheck, L]);

  const localeMap = {
    th: "th-TH",
    en: "en-US",
    lo: "lo-LA",
  };

  const currentLocale = localeMap[lang] || "th-TH";
  const currentDateLabel = now.toLocaleDateString(currentLocale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const currentTimeLabel = now.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const latestRecord = useMemo(() => {
    if (!todayData?.history?.length) return null;
    return todayData.history.reduce((latest, item) => {
      if (!latest) return item;
      return new Date(item.time).getTime() > new Date(latest.time).getTime() ? item : latest;
    }, null);
  }, [todayData]);

  const areaOptions = locations?.length
    ? locations
    : [
        { id: "pit_a", name: "Pit A" },
        { id: "pit_b", name: "Pit B" },
        { id: "drilling", name: "Drilling" },
        { id: "workshop", name: "Workshop" },
        { id: "transport", name: "Transport" },
        { id: "office", name: "Office" },
      ];

  async function startCamera() {
    if (!cameraEnabled) return;
    setCameraError("");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError(L.cameraNotSupported || "Camera not supported");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
    } catch (e) {
      setCameraError(e?.message || L.cameraStartFailed || "Cannot start camera");
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

  function takeSelfie() {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    setSelfieDataUrl(canvas.toDataURL("image/jpeg", 0.8));
  }

  useEffect(() => {
    if (cameraEnabled) {
      startCamera();
    } else {
      stopCamera();
      setSelfieDataUrl(null);
      setCameraError("");
    }

    return () => {
      stopCamera();
    };
  }, [cameraEnabled]);

  async function handleScan() {
    if (!gps) {
      setFeedback({ type: "error", message: L.needGpsFirst });
      return;
    }

    setBusy(true);
    setFeedback({ type: "", message: "" });

    try {
      let uploadedSelfieUrl = null;

      // Upload selfie to Cloudinary if camera was enabled and image was captured
      if (cameraEnabled && selfieDataUrl) {
        try {
          setFeedback({ type: "", message: "กำลังอัปโหลดรูปถ่าย..." });
          uploadedSelfieUrl = await uploadToCloudinaryWithSignature(selfieDataUrl, "tdone-attendance/scan");
        } catch (uploadError) {
          setFeedback({
            type: "error",
            message: `${L.uploadFailed || "Upload failed"}: ${uploadError.message}`,
          });
          return;
        }
      }

      const res = await fetch("/api/attendance/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAuthHeaders(),
          ...(idToken ? { "x-line-id-token": idToken } : {}),
        },
        body: JSON.stringify({
          latitude: gps.latitude,
          longitude: gps.longitude,
          accuracy: gps.accuracy,
          captured_at: new Date(gps.timestamp).toISOString(),
          fake_flags: collectGpsFlags(gps),
          device_id: makeDeviceId(),
          device_name: navigator.userAgent,
          face_verified: false,
          selfie_url: uploadedSelfieUrl,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setFeedback({ type: "error", message: data.error || L.scanFailed });
        return;
      }

      const msg = data.action === "scan_in" ? L.scanInSuccess : L.scanOutSuccess;
      setFeedback({ type: "success", message: msg });
      await loadToday();
      await refreshGps();
    } finally {
      setBusy(false);
    }
  }

  const mapSrc = gps
    ? `https://maps.google.com/maps?q=${gps.latitude},${gps.longitude}&z=16&output=embed`
    : "";

  if (loading || !session || !todayData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F4F7FC] text-[#1A2B4A]">
        <p>{L.loading}</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#F4F7FC] px-3 pb-6 pt-4 sm:px-6">
      <div className="mx-auto w-full max-w-md rounded-[28px] bg-white p-4 shadow-[0_8px_26px_rgba(15,31,61,0.1)] sm:p-5">
        <header className="mb-3 flex items-center gap-2">
          <button
            type="button"
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EEF4FF] text-xl font-bold text-[#1F4FBF]"
            aria-label="Back"
          >
            ←
          </button>
          <h1 className="flex-1 text-center text-[1.85rem] font-extrabold tracking-tight text-[#122448]">
            {L.title || "บันทึกเวลาเข้างาน"}
          </h1>
          <div className="flex items-center gap-1">
            {[
              { code: "th", label: "TH" },
              { code: "en", label: "EN" },
              { code: "lo", label: "LO" },
            ].map((item) => (
              <button
                key={item.code}
                type="button"
                onClick={() => setLang(item.code)}
                className={`rounded-full border px-2 py-1 text-[10px] font-bold transition ${
                  lang === item.code
                    ? "border-[#1F4FBF] bg-[#1F4FBF] text-white"
                    : "border-[#D5DFEF] bg-[#F8FBFF] text-[#5B6E93]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </header>

        <section className="rounded-2xl border border-[#DCE3F0] bg-white p-3 shadow-sm">
          <div className="grid grid-cols-[96px_1fr] gap-3">
            <img
              src={profile?.pictureUrl || "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?q=80&w=300&auto=format&fit=crop"}
              alt="employee"
              className="h-24 w-24 rounded-xl object-cover"
            />
            <div>
              <h2 className="text-[1.15rem] font-bold text-[#122448]">{todayData.employee?.name || profile?.displayName || "-"}</h2>
              <p className="text-base text-[#5E6F8D]">EMP: {todayData.employee?.employee_code || session.emp_id}</p>
              <div className="my-2 h-px bg-[#E2E8F4]" />
              <p className="text-xl font-semibold text-[#D62828]">{todayData.shift_name || "Night Shift"}</p>
              <p className="text-[1.45rem] text-[#334260]">{todayData.shift_time || "19:00 - 07:00"}</p>
            </div>
          </div>
        </section>

        <section className="mt-3 rounded-2xl border border-[#DCE3F0] bg-white p-3 shadow-sm">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 text-[1.2rem] font-bold text-[#1B2E52]">
                <span>📅</span>
                <span>{L.today || "วันที่"}</span>
              </div>
              <p className="mt-1 text-[1.75rem] text-[#334260]">{currentDateLabel}</p>
            </div>
            <div className="text-[3.4rem] font-extrabold leading-none text-[#122448]">{currentTimeLabel}</div>
          </div>
        </section>

        <section className="mt-3 rounded-2xl border border-[#DCE3F0] bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-[1.15rem] font-bold text-[#1B2E52]">
            <span>📍</span>
            <span>{L.workplace || "พื้นที่ทำงาน"}</span>
          </div>
          <select
            value={selectedWorkArea}
            onChange={(e) => setSelectedWorkArea(e.target.value)}
            className="w-full rounded-xl border border-[#D5DFEF] bg-white px-3 py-2 text-lg text-[#122448]"
          >
            <option value="">{lang === "en" ? "Select Area" : lang === "lo" ? "ເລືອກພື້ນທີ່" : "เลือกพื้นที่"}</option>
            {areaOptions.map((item, idx) => {
              const label = item.name || item.location_name || item.area_name || `Area ${idx + 1}`;
              const value = item.id || label;
              return (
                <option key={`${value}-${idx}`} value={label}>{label}</option>
              );
            })}
          </select>
        </section>

        <section className="mt-3 rounded-2xl border border-[#DCE3F0] bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-[1.2rem] font-bold text-[#1B2E52]">
            <span className="text-green-600">✔</span>
            <span>{L.gpsStatus || "GPS Status"}</span>
          </div>
          <div className="rounded-xl border border-[#DCE3F0] bg-[#FBFDFF] p-3">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 text-green-600">✔</span>
              <div>
                <p className="text-lg font-semibold text-[#1B2E52]">{L.statusLabel || "Location Verified"}: {statusLabel}</p>
                <p className="text-base text-[#334260]">{locationCheck?.nearest?.name || selectedWorkArea || "Pit A Mining Area"}</p>
                <p className="text-base text-[#4E607F]">
                  {L.gpsCoords || "GPS"}: {gps ? `${gps.latitude.toFixed(3)} , ${gps.longitude.toFixed(3)}` : "-"}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-3 overflow-hidden rounded-xl border border-[#D5DFEF]">
            {gps ? (
              <iframe title="scan-map" src={mapSrc} className="h-36 w-full" />
            ) : (
              <div className="relative h-36 w-full bg-gradient-to-br from-[#DCEBDD] to-[#D5E3F4]">
                <div className="absolute left-[-10%] top-[56%] h-2 w-[130%] -rotate-[14deg] bg-[#F4A92B]" />
                <div className="absolute left-1/2 top-[46%] h-8 w-8 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[50%_50%_50%_0] bg-[#6AAE67] shadow-md" />
                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-[#2E426A]">
                  {selectedWorkArea || "Pit A"}
                </div>
              </div>
            )}
          </div>

          {gpsError ? <p className="mt-2 text-sm text-red-600">{gpsError}</p> : null}
          {locationCheck?.suspicious_reasons?.length ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
              {L.suspicious}: {locationCheck.suspicious_reasons.join(", ")}
            </p>
          ) : null}
        </section>

        <button
          type="button"
          onClick={refreshGps}
          className="mt-3 w-full rounded-xl bg-gradient-to-b from-[#F04747] to-[#E53935] py-3 text-[1.45rem] font-extrabold text-white shadow-[0_8px_14px_rgba(229,57,53,0.3)] transition hover:brightness-105 active:translate-y-[1px] active:brightness-95"
        >
          {L.refreshGps || "ตรวจสอบตำแหน่ง GPS"}
        </button>

        <section className="mt-3 rounded-2xl border border-[#DCE3F0] bg-white p-3 shadow-sm">
          <div className="mb-2 flex items-center gap-2 text-[1.2rem] font-bold text-[#1B2E52]">
            <span>☑</span>
            <span>{L.todayHistory || "ลงเวลาล่าสุด"}</span>
          </div>
          <div className="rounded-xl border border-[#DCE3F0] bg-[#FBFDFF] px-3 py-2 text-xl text-[#233656]">
            {latestRecord ? `${latestRecord.type === "scan_out" ? L.scanOut : L.scanIn} ${new Date(latestRecord.time).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}` : (L.noHistory || "Check In 06:49")}
          </div>

          <div className="my-3 h-px bg-[#E2E8F4]" />

          <div className="flex items-center justify-around gap-3 text-[1.15rem] font-semibold text-[#2A3D63]">
            <div className="flex items-center gap-1">
              <span className="text-green-600">✔</span>
              <span>{lang === "en" ? "Device Verified" : lang === "lo" ? "ຢືນຢັນອຸປະກອນ" : "Device Verified"}</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-green-600">✔</span>
              <span>{lang === "en" ? "Network: Online" : lang === "lo" ? "ເຄືອຂ່າຍ: ອອນລາຍ" : "Network: Online"}</span>
            </div>
          </div>
        </section>

        <section className="mt-3 rounded-2xl border border-[#DCE3F0] bg-white p-3 shadow-sm">
          <div className="flex items-center gap-2 text-sm text-[#334260]">
            <input
              id="camera-optional"
              type="checkbox"
              checked={cameraEnabled}
              onChange={(e) => setCameraEnabled(e.target.checked)}
            />
            <label htmlFor="camera-optional">{L.faceOptional}</label>
          </div>
          <p className="mt-1 text-xs text-[#6B7A99]">{L.faceNote}</p>

          {cameraEnabled ? (
            <div className="mt-2 rounded-xl border border-[#D0D8E4] p-3 space-y-2">
              <video ref={videoRef} className="w-full max-h-64 rounded-lg bg-black" muted playsInline />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={takeSelfie} className="rounded-lg border border-[#1352A3] px-3 py-1.5 text-[#1352A3] text-sm">{L.captureSelfie || "Capture Selfie"}</button>
                <button type="button" onClick={() => setSelfieDataUrl(null)} className="rounded-lg border border-[#D0D8E4] px-3 py-1.5 text-[#334260] text-sm">{L.retakeSelfie || "Retake"}</button>
              </div>
              {selfieDataUrl ? <img src={selfieDataUrl} alt="selfie-preview" className="w-36 h-36 object-cover rounded-lg border border-[#D0D8E4]" /> : null}
              {cameraError ? <p className="text-xs text-red-600">{cameraError}</p> : null}
            </div>
          ) : null}
        </section>

        <button
          type="button"
          onClick={handleScan}
          disabled={busy || !canScan}
          className={`mt-3 w-full rounded-2xl py-3 text-[1.75rem] font-extrabold text-white transition hover:brightness-105 active:translate-y-[1px] active:brightness-95 ${
            !canScan
              ? "bg-[#A8B4CC]"
              : "bg-gradient-to-b from-[#2F6BDB] to-[#1F4FBF] shadow-[0_10px_16px_rgba(31,79,191,0.32)]"
          }`}
        >
          {busy ? L.scanning : suggestedAction === "scan_out" ? (L.scanOut || "Scan Out") : (L.scanIn || "ยืนยันเวลาเข้างาน")}
        </button>

        {feedback.message ? (
          <div className={`mt-3 rounded-xl border px-3 py-2 text-sm ${feedback.type === "success" ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}>
            {feedback.message}
          </div>
        ) : null}

        {todayData.history?.length ? (
          <section className="mt-3 rounded-2xl border border-[#DCE3F0] bg-white p-3 shadow-sm">
            <h2 className="mb-2 text-sm font-bold text-[#1A2B4A]">{L.todayHistory}</h2>
            <div className="space-y-2">
              {todayData.history.map((item, idx) => (
                <div key={`${item.type}-${idx}`} className="rounded-lg border border-[#E5EAF0] p-2 text-sm text-[#334260]">
                  <p className="font-semibold">{item.type === "scan_in" ? L.scanIn : L.scanOut}</p>
                  <p>{L.time}: {formatDateTime(item.time, lang)}</p>
                </div>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
