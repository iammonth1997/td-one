import { validateSession } from "@/lib/validateSession";
import { detectSuspiciousGps, verifyWorkLocation } from "@/lib/attendanceUtils";
import { verifyAttendanceLiffBySession } from "@/lib/verifyAttendanceLiff";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";
import { EMPLOYEE_PORTAL, isPortalContextAllowed } from "@/lib/sessionContext";

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  if (!isPortalContextAllowed(session, [EMPLOYEE_PORTAL])) {
    return Response.json({ error: "FORBIDDEN_PORTAL_CONTEXT" }, { status: 403 });
  }

  const accessProfile = buildSessionAccessProfile(session);
  if (!hasAnyPermission(accessProfile, ["attendance.read.self", "attendance.read.team", "attendance.read.department", "attendance.read.all"])) {
    return Response.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const liffCheck = await verifyAttendanceLiffBySession(req, session.emp_id);
  if (!liffCheck.ok) {
    return Response.json({ error: liffCheck.error, detail: liffCheck.detail || null }, { status: liffCheck.status });
  }

  const { latitude, longitude, accuracy, captured_at, fake_flags } = await req.json();

  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return Response.json({ error: "INVALID_COORDINATES" }, { status: 400 });
  }

  const locationCheck = await verifyWorkLocation(lat, lon);
  if (!locationCheck.ok) {
    return Response.json({ error: locationCheck.error, detail: locationCheck.detail || null }, { status: 500 });
  }

  const fakeGps = detectSuspiciousGps({
    accuracy,
    clientCapturedAt: captured_at,
    clientFlags: Array.isArray(fake_flags) ? fake_flags : [],
  });

  return Response.json({
    success: true,
    inside: locationCheck.inside,
    nearest: locationCheck.nearest,
    suspicious_gps: fakeGps.suspicious,
    suspicious_reasons: fakeGps.reasons,
  });
}
