import { validateSession } from "@/lib/validateSession";
import { loadActiveWorkLocations } from "@/lib/attendanceUtils";
import { supabaseServer } from "@/lib/supabaseServer";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";

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
      .select("id, name, latitude, longitude, radius_meters, is_active, created_at")
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

  const { name, latitude, longitude, radius_meters, is_active } = await req.json();
  const payload = {
    name: String(name || "").trim(),
    latitude: Number(latitude),
    longitude: Number(longitude),
    radius_meters: Number(radius_meters || 200),
    is_active: is_active !== false,
  };

  if (!payload.name || !Number.isFinite(payload.latitude) || !Number.isFinite(payload.longitude)) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const { data, error } = await supabaseServer
    .from("work_locations")
    .insert(payload)
    .select("id, name, latitude, longitude, radius_meters, is_active, created_at")
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

  const { id, name, latitude, longitude, radius_meters, is_active } = await req.json();
  const locationId = String(id || "").trim();
  if (!locationId) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
  }

  const updates = {};
  if (name !== undefined) updates.name = String(name || "").trim();
  if (latitude !== undefined) updates.latitude = Number(latitude);
  if (longitude !== undefined) updates.longitude = Number(longitude);
  if (radius_meters !== undefined) updates.radius_meters = Number(radius_meters);
  if (is_active !== undefined) updates.is_active = Boolean(is_active);

  const { data, error } = await supabaseServer
    .from("work_locations")
    .update(updates)
    .eq("id", locationId)
    .select("id, name, latitude, longitude, radius_meters, is_active, created_at")
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
