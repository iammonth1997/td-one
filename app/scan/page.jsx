"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/app/hooks/useSession";
import { useLanguage } from "@/app/context/LanguageContext";
import { useLiff } from "@/app/hooks/useLiff";

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
  const { t, lang } = useLanguage();
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

  async function handleScan() {
    if (!gps) {
      setFeedback({ type: "error", message: L.needGpsFirst });
      return;
    }

    setBusy(true);
    setFeedback({ type: "", message: "" });

    try {
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
          selfie_url: null,
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
      <div className="min-h-screen flex items-center justify-center bg-[#F5F7FA] text-[#1A2B4A]">
        <p>{L.loading}</p>
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-[#F5F7FA] p-4 sm:p-6">
      <div className="mx-auto max-w-5xl space-y-4">
        <section className="rounded-2xl border border-[#D0D8E4] bg-white p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold text-[#1A2B4A]">{L.title}</h1>
              <p className="text-sm text-[#6B7A99] mt-1">{L.subtitle}</p>
            </div>
            <div className="text-sm text-[#334260]">
              <div>{L.currentTime}: <span className="font-semibold">{formatDateTime(now.toISOString(), lang)}</span></div>
              <div>{L.today}: <span className="font-semibold">{todayData.today}</span></div>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-[#D0D8E4] bg-white p-5 space-y-3">
            <h2 className="text-lg font-bold text-[#1A2B4A]">{L.employeeInfo}</h2>
            <div className="text-sm text-[#334260] space-y-1">
              <p>{L.empCode}: <span className="font-semibold">{todayData.employee?.employee_code || session.emp_id}</span></p>
              <p>{L.empName}: <span className="font-semibold">{todayData.employee?.name || "-"}</span></p>
              <p>{L.department}: <span className="font-semibold">{todayData.employee?.department || "-"}</span></p>
              <p>{L.position}: <span className="font-semibold">{todayData.employee?.position || "-"}</span></p>
              <p>{L.liffName}: <span className="font-semibold">{profile?.displayName || "-"}</span></p>
              <p>{L.liffUserId}: <span className="font-mono text-xs break-all">{profile?.userId || todayData.employee?.line_user_id || "-"}</span></p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#D0D8E4] bg-white p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-[#1A2B4A]">{L.gpsStatus}</h2>
              <button
                type="button"
                onClick={refreshGps}
                className="rounded-lg bg-[#E8F0FB] px-3 py-1.5 text-sm text-[#1352A3] hover:bg-[#DCE8FA]"
              >
                {L.refreshGps}
              </button>
            </div>

            <p className="text-sm">
              {L.statusLabel}: <span className={`font-semibold ${locationCheck?.inside ? "text-green-600" : "text-amber-700"}`}>{statusLabel}</span>
            </p>

            <p className="text-sm text-[#334260]">{L.gpsCoords}: {gps ? `${gps.latitude.toFixed(6)}, ${gps.longitude.toFixed(6)}` : "-"}</p>
            <p className="text-sm text-[#334260]">{L.gpsAccuracy}: {gps?.accuracy ? `${Math.round(gps.accuracy)} m` : "-"}</p>
            <p className="text-sm text-[#334260]">{L.distance}: {locationCheck?.nearest?.distance_meters ?? "-"} m</p>
            <p className="text-sm text-[#334260]">{L.workplace}: {locationCheck?.nearest?.name || "-"}</p>

            {locationCheck?.suspicious_reasons?.length ? (
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-2 text-amber-800 text-xs">
                {L.suspicious}: {locationCheck.suspicious_reasons.join(", ")}
              </div>
            ) : null}

            {gpsError ? <p className="text-sm text-red-600">{gpsError}</p> : null}
          </div>
        </section>

        <section className="rounded-2xl border border-[#D0D8E4] bg-white p-5">
          <h2 className="text-lg font-bold text-[#1A2B4A] mb-3">{L.mapTitle}</h2>
          {gps ? (
            <iframe
              title="scan-map"
              src={mapSrc}
              className="w-full h-64 rounded-xl border border-[#D0D8E4]"
            />
          ) : (
            <div className="h-40 flex items-center justify-center rounded-xl border border-dashed border-[#D0D8E4] text-[#6B7A99] text-sm">
              {L.mapPlaceholder}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-[#D0D8E4] bg-white p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-[#1A2B4A]">{L.scanAction}</h2>
            <span className="text-sm text-[#334260]">{L.nextAction}: <strong>{suggestedAction === "scan_out" ? L.scanOut : suggestedAction === "completed" ? L.completed : L.scanIn}</strong></span>
          </div>

          <div className="flex items-center gap-2 text-sm text-[#334260]">
            <input
              id="camera-optional"
              type="checkbox"
              checked={cameraEnabled}
              onChange={(e) => setCameraEnabled(e.target.checked)}
            />
            <label htmlFor="camera-optional">{L.faceOptional}</label>
          </div>
          <p className="text-xs text-[#6B7A99]">{L.faceNote}</p>

          <button
            type="button"
            onClick={handleScan}
            disabled={busy || !canScan}
            className={`w-full rounded-2xl py-4 text-lg font-bold transition ${
              !canScan
                ? "bg-[#CBD5E1] text-white"
                : suggestedAction === "scan_out"
                  ? "bg-[#F5A623] hover:bg-[#D88F1A] text-white"
                  : "bg-[#1352A3] hover:bg-[#0D3B7A] text-white"
            }`}
          >
            {busy ? L.scanning : suggestedAction === "scan_out" ? L.scanOut : L.scanIn}
          </button>

          {feedback.message ? (
            <div className={`rounded-lg p-3 text-sm ${feedback.type === "success" ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}>
              {feedback.message}
            </div>
          ) : null}
        </section>

        <section className="rounded-2xl border border-[#D0D8E4] bg-white p-5">
          <h2 className="text-lg font-bold text-[#1A2B4A] mb-3">{L.todayHistory}</h2>
          {!todayData.history?.length ? (
            <p className="text-sm text-[#6B7A99]">{L.noHistory}</p>
          ) : (
            <div className="space-y-2">
              {todayData.history.map((item, idx) => (
                <div key={`${item.type}-${idx}`} className="rounded-lg border border-[#E5EAF0] p-3 text-sm text-[#334260]">
                  <p className="font-semibold">{item.type === "scan_in" ? L.scanIn : L.scanOut}</p>
                  <p>{L.time}: {formatDateTime(item.time, lang)}</p>
                  <p>{L.gpsCoords}: {item.latitude}, {item.longitude}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
