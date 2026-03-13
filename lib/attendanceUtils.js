import { supabaseServer } from "@/lib/supabaseServer";

const EARTH_RADIUS_METERS = 6371000;
const MIN_RADIUS = Number(process.env.ATTENDANCE_MIN_RADIUS_METERS || 100);
const MAX_RADIUS = Number(process.env.ATTENDANCE_MAX_RADIUS_METERS || 500);
const DEFAULT_RADIUS = Number(process.env.ATTENDANCE_DEFAULT_RADIUS_METERS || 200);

function normalizeBoundaryType(value) {
  return String(value || "circle").trim().toLowerCase() === "rectangle"
    ? "rectangle"
    : "circle";
}

function normalizeRectangleBoundary(boundaryJson) {
  if (!boundaryJson || typeof boundaryJson !== "object") return null;

  const south = Number(boundaryJson.south);
  const west = Number(boundaryJson.west);
  const north = Number(boundaryJson.north);
  const east = Number(boundaryJson.east);

  if (![south, west, north, east].every(Number.isFinite)) {
    return null;
  }

  return {
    south: Math.min(south, north),
    west: Math.min(west, east),
    north: Math.max(south, north),
    east: Math.max(west, east),
  };
}

function rectangleContainsPoint(lat, lon, boundary) {
  return lat >= boundary.south
    && lat <= boundary.north
    && lon >= boundary.west
    && lon <= boundary.east;
}

function deriveRectangleCenter(boundary) {
  return {
    latitude: (boundary.south + boundary.north) / 2,
    longitude: (boundary.west + boundary.east) / 2,
  };
}

function deriveRectangleRadius(boundary) {
  const center = deriveRectangleCenter(boundary);
  return Math.round(haversineMeters(center.latitude, center.longitude, boundary.north, boundary.east));
}

export function getTodayDateInBangkok() {
  const now = new Date();
  const tz = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const y = tz.getFullYear();
  const m = String(tz.getMonth() + 1).padStart(2, "0");
  const d = String(tz.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function normalizeRadius(value) {
  const radius = Number(value || DEFAULT_RADIUS);
  if (!Number.isFinite(radius)) return DEFAULT_RADIUS;
  return Math.min(Math.max(radius, MIN_RADIUS), MAX_RADIUS);
}

export function haversineMeters(lat1, lon1, lat2, lon2) {
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export async function getEmployeeFromSessionEmpId(empId) {
  const { data, error } = await supabaseServer
    .from("employees")
    .select("*")
    .eq("employee_code", empId)
    .maybeSingle();

  if (error) return { employee: null, error };
  return { employee: data || null, error: null };
}

export function pickEmployeeName(employee) {
  if (!employee) return null;
  return employee.full_name
    || employee.name
    || employee.employee_name
    || [employee.first_name, employee.last_name].filter(Boolean).join(" ")
    || [employee.first_name_th, employee.last_name_th].filter(Boolean).join(" ")
    || employee.employee_code
    || null;
}

export async function loadActiveWorkLocations() {
  const { data, error } = await supabaseServer
    .from("work_locations")
    .select("id, name, latitude, longitude, radius_meters, boundary_type, boundary_json")
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (error) return { rows: [], error };

  const rows = (data || []).map((row) => ({
    ...row,
    boundary_type: normalizeBoundaryType(row.boundary_type),
    boundary_json: normalizeRectangleBoundary(row.boundary_json),
    radius_meters: normalizeRadius(row.radius_meters),
  }));

  return {
    rows: rows.map((row) => {
      if (row.boundary_type !== "rectangle" || !row.boundary_json) {
        return row;
      }

      const center = deriveRectangleCenter(row.boundary_json);
      return {
        ...row,
        latitude: center.latitude,
        longitude: center.longitude,
        radius_meters: deriveRectangleRadius(row.boundary_json),
      };
    }),
    error: null,
  };
}

export async function verifyWorkLocation(lat, lon) {
  const { rows, error } = await loadActiveWorkLocations();
  if (error) {
    return { ok: false, error: "WORK_LOCATION_QUERY_FAILED", detail: error.message };
  }

  if (!rows.length) {
    return { ok: false, error: "NO_ACTIVE_WORK_LOCATIONS" };
  }

  let nearest = null;
  for (const location of rows) {
    const distance = haversineMeters(
      Number(lat),
      Number(lon),
      Number(location.latitude),
      Number(location.longitude)
    );

    const withinBoundary = location.boundary_type === "rectangle" && location.boundary_json
      ? rectangleContainsPoint(Number(lat), Number(lon), location.boundary_json)
      : distance <= location.radius_meters;

    const candidate = {
      ...location,
      distance_meters: Math.round(distance),
      within_radius: distance <= location.radius_meters,
      within_boundary: withinBoundary,
    };

    if (!nearest || candidate.distance_meters < nearest.distance_meters) {
      nearest = candidate;
    }
  }

  return {
    ok: true,
    nearest,
    inside: Boolean(nearest?.within_boundary ?? nearest?.within_radius),
    locations: rows,
  };
}

export function detectSuspiciousGps({ accuracy, clientCapturedAt, clientFlags = [] }) {
  const reasons = [];

  const numericAccuracy = Number(accuracy);
  if (Number.isFinite(numericAccuracy)) {
    if (numericAccuracy < 5) reasons.push("accuracy_too_precise");
    if (numericAccuracy > 5000) reasons.push("accuracy_too_low");
  }

  if (clientCapturedAt) {
    const clientTs = new Date(clientCapturedAt).getTime();
    if (!Number.isNaN(clientTs)) {
      const skew = Math.abs(Date.now() - clientTs);
      if (skew > 3 * 60 * 1000) reasons.push("timestamp_skew_high");
    } else {
      reasons.push("invalid_client_timestamp");
    }
  }

  for (const flag of clientFlags) {
    if (typeof flag === "string" && flag.trim()) {
      reasons.push(`client_flag:${flag.trim()}`);
    }
  }

  return {
    suspicious: reasons.length > 0,
    reasons,
  };
}

export async function logAttendanceScanAttempt(payload) {
  const { error } = await supabaseServer
    .from("attendance_scan_logs")
    .insert(payload);

  if (error) {
    console.error("attendance scan log insert failed:", error.message);
  }
}
