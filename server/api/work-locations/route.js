import { validateSession } from "@/lib/validateSession";
import { loadActiveWorkLocations } from "@/lib/attendanceUtils";
import { supabaseServer } from "@/lib/supabaseServer";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";

function normalizeBoundaryType(value) {
  const normalized = String(value || "circle").trim().toLowerCase();
  if (normalized === "rectangle" || normalized === "polygon") {
    return normalized;
  }
  return "circle";
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

function normalizePolygonBoundary(boundaryJson) {
  if (!boundaryJson || typeof boundaryJson !== "object" || !Array.isArray(boundaryJson.points)) {
    return null;
  }

  const points = boundaryJson.points
    .map((point) => ({
      lat: Number(point?.lat),
      lng: Number(point?.lng),
    }))
    .filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng));

  if (points.length < 3) {
    return null;
  }

  return { points };
}

function deriveRectangleCenter(boundary) {
  return {
    latitude: (boundary.south + boundary.north) / 2,
    longitude: (boundary.west + boundary.east) / 2,
  };
}

function derivePolygonCenter(boundary) {
  const latitudes = boundary.points.map((point) => point.lat);
  const longitudes = boundary.points.map((point) => point.lng);

  return {
    latitude: (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
    longitude: (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
  };
}

function deriveRectangleRadius(boundary) {
  const latDistance = Math.abs(boundary.north - boundary.south) * 111320;
  const lngDistance = Math.abs(boundary.east - boundary.west) * 111320;
  return Math.round(Math.sqrt(latDistance ** 2 + lngDistance ** 2) / 2);
}

function derivePolygonRadius(boundary) {
  const center = derivePolygonCenter(boundary);
  const distances = boundary.points.map((point) => {
    const latDistance = Math.abs(point.lat - center.latitude) * 111320;
    const lngDistance = Math.abs(point.lng - center.longitude) * 111320;
    return Math.sqrt(latDistance ** 2 + lngDistance ** 2);
  });

  return Math.round(Math.max(...distances));
}

function buildLocationPayload(input) {
  const boundaryType = normalizeBoundaryType(input.boundary_type);
  const payload = {
    name: String(input.name || "").trim(),
    latitude: Number(input.latitude),
    longitude: Number(input.longitude),
    radius_meters: Number(input.radius_meters || 200),
    is_active: input.is_active !== false,
    boundary_type: boundaryType,
    boundary_json: null,
  };

  if (boundaryType === "rectangle") {
    const boundary = normalizeRectangleBoundary(input.boundary_json);
    if (!boundary) {
      return { payload: null, error: "INVALID_BOUNDARY" };
    }

    const center = deriveRectangleCenter(boundary);
    payload.latitude = center.latitude;
    payload.longitude = center.longitude;
    payload.radius_meters = deriveRectangleRadius(boundary);
    payload.boundary_json = boundary;
  }

  if (boundaryType === "polygon") {
    const boundary = normalizePolygonBoundary(input.boundary_json);
    if (!boundary) {
      return { payload: null, error: "INVALID_BOUNDARY" };
    }

    const center = derivePolygonCenter(boundary);
    payload.latitude = center.latitude;
    payload.longitude = center.longitude;
    payload.radius_meters = derivePolygonRadius(boundary);
    payload.boundary_json = boundary;
  }

  if (!payload.name || !Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)) {
    return { payload: null, error: "INVALID_INPUT" };
  }

  if (boundaryType === "circle" && !Number.isFinite(payload.radius_meters)) {
    return { payload: null, error: "INVALID_INPUT" };
  }

  return { payload, error: null };
}

export async function GET(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const accessProfile = buildSessionAccessProfile(session);
  const canManage = hasAnyPermission(accessProfile, ["settings.work_location.manage", "rbac.manage"]);

  const { searchParams } = new URL(req.url);
  const includeInactive = searchParams.get("all") === "1";

  if (includeInactive && !canManage) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  if (includeInactive) {
    const { data, error } = await supabaseServer
      .from("work_locations")
      .select("id, name, latitude, longitude, radius_meters, boundary_type, boundary_json, is_active, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      return Response.json({ error: "WORK_LOCATION_QUERY_FAILED", detail: error.message }, { status: 500 });
    }

    return Response.json({ success: true, rows: data || [] });
  }

  const { rows, error } = await loadActiveWorkLocations();
  if (error) {
    return Response.json({ error: "WORK_LOCATION_QUERY_FAILED", detail: error.message }, { status: 500 });
  }

  return Response.json({ success: true, rows });
}

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const accessProfile = buildSessionAccessProfile(session);
  if (!hasAnyPermission(accessProfile, ["settings.work_location.manage", "rbac.manage"])) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const requestBody = await req.json();
  const { payload, error: payloadError } = buildLocationPayload(requestBody);

  if (payloadError) {
    return Response.json({ error: payloadError }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("work_locations")
    .insert(payload)
    .select("id, name, latitude, longitude, radius_meters, boundary_type, boundary_json, is_active, created_at")
    .maybeSingle();

  if (error) {
    return Response.json({ error: "WORK_LOCATION_CREATE_FAILED", detail: error.message }, { status: 500 });
  }

  return Response.json({ success: true, row: data });
}

export async function PUT(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const accessProfile = buildSessionAccessProfile(session);
  if (!hasAnyPermission(accessProfile, ["settings.work_location.manage", "rbac.manage"])) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const requestBody = await req.json();
  const { id } = requestBody;
  const locationId = String(id || "").trim();
  if (!locationId) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const updates = {};
  if (
    requestBody.name !== undefined
    || requestBody.latitude !== undefined
    || requestBody.longitude !== undefined
    || requestBody.radius_meters !== undefined
    || requestBody.boundary_type !== undefined
    || requestBody.boundary_json !== undefined
  ) {
    const { payload, error: payloadError } = buildLocationPayload({
      name: requestBody.name,
      latitude: requestBody.latitude,
      longitude: requestBody.longitude,
      radius_meters: requestBody.radius_meters,
      boundary_type: requestBody.boundary_type,
      boundary_json: requestBody.boundary_json,
      is_active: requestBody.is_active,
    });

    if (payloadError) {
      return Response.json({ error: payloadError }, { status: 400 });
    }

    Object.assign(updates, payload);
  }

  if (requestBody.is_active !== undefined) updates.is_active = Boolean(requestBody.is_active);

  const { data, error } = await supabaseServer
    .from("work_locations")
    .update(updates)
    .eq("id", locationId)
    .select("id, name, latitude, longitude, radius_meters, boundary_type, boundary_json, is_active, created_at")
    .maybeSingle();

  if (error) {
    return Response.json({ error: "WORK_LOCATION_UPDATE_FAILED", detail: error.message }, { status: 500 });
  }

  return Response.json({ success: true, row: data });
}

export async function DELETE(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const accessProfile = buildSessionAccessProfile(session);
  if (!hasAnyPermission(accessProfile, ["settings.work_location.manage", "rbac.manage"])) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = String(searchParams.get("id") || "").trim();
  if (!id) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const { error } = await supabaseServer
    .from("work_locations")
    .delete()
    .eq("id", id);

  if (error) {
    return Response.json({ error: "WORK_LOCATION_DELETE_FAILED", detail: error.message }, { status: 500 });
  }

  return Response.json({ success: true, id });
}
