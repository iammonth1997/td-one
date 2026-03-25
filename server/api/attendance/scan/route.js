import { validateSession } from "@/lib/validateSession";
import {
  detectSuspiciousGps,
  getEmployeeFromSessionEmpId,
  getTodayDateInBangkok,
  logAttendanceScanAttempt,
  verifyWorkLocation,
} from "@/lib/attendanceUtils";
import prisma from "@/lib/prisma";
import { buildSessionAccessProfile } from "@/lib/rbac/sessionAccess";
import { hasAnyPermission } from "@/lib/rbac/access";
import { EMPLOYEE_PORTAL, isPortalContextAllowed } from "@/lib/sessionContext";

function getClientIp(req) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || null;
}

function normalizeFlags(flags) {
  if (!Array.isArray(flags)) return [];
  return flags
    .map((flag) => String(flag || "").trim())
    .filter(Boolean)
    .slice(0, 20);
}

function parseScanPayload(payload = {}) {
  const gpsPosition = payload.gpsPosition && typeof payload.gpsPosition === "object"
    ? payload.gpsPosition
    : null;

  const latitude = Number(
    payload.latitude
      ?? gpsPosition?.latitude
      ?? gpsPosition?.lat
  );
  const longitude = Number(
    payload.longitude
      ?? gpsPosition?.longitude
      ?? gpsPosition?.lng
      ?? gpsPosition?.lon
  );
  const accuracy = Number(
    payload.accuracy
      ?? gpsPosition?.accuracy
      ?? 0
  );

  const deviceId = String(payload.deviceId ?? payload.device_id ?? "").trim();
  const employeeId = String(payload.employeeId ?? payload.employee_id ?? "").trim().toUpperCase();
  const timestamp = payload.timestamp || payload.captured_at || new Date().toISOString();
  const faceMatchScoreRaw = payload.faceMatchScore ?? payload.face_match_score;
  const faceMatchScore = Number.isFinite(Number(faceMatchScoreRaw)) ? Number(faceMatchScoreRaw) : null;
  const faceVerified = Boolean(payload.face_verified) || (typeof faceMatchScore === "number" && faceMatchScore >= 0.75);
  const selfieUrl = payload.selfie_url || null;

  const baseFlags = normalizeFlags(payload.suspicionFlags ?? payload.suspicion_flags);
  const legacyFlags = normalizeFlags(payload.suspected_spoofing_flags ?? payload.fake_flags);
  const suspicionFlags = [...new Set([...baseFlags, ...legacyFlags])];

  const scoreRaw = payload.suspicionScore ?? payload.suspicion_score ?? payload.suspected_spoofing_score;
  const suspicionScore = Number.isFinite(Number(scoreRaw)) ? Number(scoreRaw) : 0;

  return {
    latitude,
    longitude,
    accuracy,
    deviceId,
    employeeId,
    timestamp,
    faceMatchScore,
    faceVerified,
    selfieUrl,
    suspicionFlags,
    suspicionScore,
    rawGpsPosition: gpsPosition,
  };
}

function classifySuspicion(score) {
  if (score > 70) return "blocked";
  if (score >= 31) return "flagged";
  return "normal";
}

async function persistSuspiciousScan({
  employee,
  employeeCode,
  attendanceId,
  timestamp,
  latitude,
  longitude,
  accuracy,
  suspicionScore,
  suspicionFlags,
  faceMatchScore,
  deviceId,
  scanStatus,
  reviewAction,
  reviewNote,
}) {
  try {
    await prisma.attendanceSuspiciousScan.create({
      data: {
        employee_id: employee?.id || null,
        employee_code: employeeCode || null,
        attendance_id: attendanceId || null,
        scan_timestamp: timestamp ? new Date(timestamp) : new Date(),
        gps_position: { latitude, longitude, accuracy },
        suspicion_score: Math.max(0, Math.round(Number(suspicionScore || 0))),
        suspicion_flags: normalizeFlags(suspicionFlags),
        face_match_score: typeof faceMatchScore === "number" ? faceMatchScore : null,
        device_id: deviceId || null,
        scan_status: scanStatus,
        review_action: reviewAction,
        review_note: reviewNote || null,
      },
    });
  } catch (err) {
    console.error("[attendance/scan] failed to save suspicious scan", err.message);
  }
}

async function notifyHrBlockedScan({ employeeCode, suspicionScore, suspicionFlags, timestamp }) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const message = [
      "🚨 Attendance scan blocked",
      `Employee: ${employeeCode || "unknown"}`,
      `Score: ${suspicionScore}`,
      `Time: ${timestamp}`,
      `Flags: ${normalizeFlags(suspicionFlags).join(", ") || "none"}`,
    ].join("\n");

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
  } catch (error) {
    console.error("[attendance/scan] HR notify failed", error);
  }
}

export async function POST(req) {
  try {
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

    let payload;
    try {
      payload = await req.json();
    } catch (e) {
      return Response.json({ error: "INVALID_JSON", message: String(e.message || e) }, { status: 400 });
    }

    const normalized = parseScanPayload(payload);
    const latitude = normalized.latitude;
    const longitude = normalized.longitude;
    const accuracy = normalized.accuracy;
    const deviceId = normalized.deviceId;
    const faceVerified = normalized.faceVerified;
    const selfieUrl = normalized.selfieUrl;
    const fakeFlags = normalized.suspicionFlags;

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !deviceId) {
      return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    if (normalized.employeeId && normalized.employeeId !== String(session.emp_id || "").trim().toUpperCase()) {
      return Response.json({ error: "EMPLOYEE_MISMATCH" }, { status: 403 });
    }

    const { employee, error: employeeError } = await getEmployeeFromSessionEmpId(session.emp_id);
    if (employeeError) {
      return Response.json({ error: "EMPLOYEE_QUERY_FAILED", detail: employeeError.message }, { status: 500 });
    }

    if (!employee) {
      return Response.json({ error: "EMPLOYEE_NOT_FOUND" }, { status: 400 });
    }

    const today = getTodayDateInBangkok();
    const ip = getClientIp(req);

    const locationCheck = await verifyWorkLocation(latitude, longitude);
    if (!locationCheck.ok) {
      await logAttendanceScanAttempt({
        employee_id: employee.id,
        emp_code: session.emp_id,
        date: today,
        action_type: "scan_unknown",
        success: false,
        reason: locationCheck.error,
        latitude,
        longitude,
        accuracy_meters: accuracy || null,
        device_id: deviceId,
        ip_address: ip,
        user_agent: req.headers.get("user-agent") || null,
      });
      return Response.json({ error: locationCheck.error, detail: locationCheck.detail || null }, { status: 500 });
    }

    if (!locationCheck.inside) {
      await logAttendanceScanAttempt({
        employee_id: employee.id,
        emp_code: session.emp_id,
        date: today,
        action_type: "scan_unknown",
        success: false,
        reason: "OUTSIDE_WORK_AREA",
        latitude,
        longitude,
        accuracy_meters: accuracy || null,
        location_id: locationCheck.nearest?.id || null,
        distance_meters: locationCheck.nearest?.distance_meters || null,
        device_id: deviceId,
        ip_address: ip,
        user_agent: req.headers.get("user-agent") || null,
      });
      return Response.json({
        error: "OUTSIDE_WORK_AREA",
        nearest: locationCheck.nearest,
      }, { status: 403 });
    }

    const fakeGps = detectSuspiciousGps({
      accuracy,
      clientCapturedAt: normalized.timestamp,
      clientFlags: fakeFlags,
    });

    const mergedFlags = [...new Set([
      ...normalizeFlags(fakeFlags),
      ...(fakeGps.suspicious ? fakeGps.reasons : []),
    ])];
    const normalizedScore = Math.max(0, Math.round(Number(normalized.suspicionScore || 0)));
    const finalSuspicionScore = fakeGps.suspicious ? Math.max(75, normalizedScore) : normalizedScore;
    const suspicionStatus = classifySuspicion(finalSuspicionScore);

    if (suspicionStatus === "blocked") {
      await logAttendanceScanAttempt({
        employee_id: employee.id,
        emp_code: session.emp_id,
        date: today,
        action_type: "scan_unknown",
        success: false,
        reason: `SUSPICIOUS_SCAN_BLOCKED:${mergedFlags.join("|") || "score_threshold"}`,
        latitude,
        longitude,
        accuracy_meters: accuracy || null,
        location_id: locationCheck.nearest?.id || null,
        distance_meters: locationCheck.nearest?.distance_meters || null,
        device_id: deviceId,
        ip_address: ip,
        user_agent: req.headers.get("user-agent") || null,
      });

      await persistSuspiciousScan({
        employee,
        employeeCode: session.emp_id,
        attendanceId: null,
        timestamp: normalized.timestamp,
        latitude,
        longitude,
        accuracy,
        suspicionScore: finalSuspicionScore,
        suspicionFlags: mergedFlags,
        faceMatchScore: normalized.faceMatchScore,
        deviceId,
        scanStatus: "blocked",
        reviewAction: "pending",
        reviewNote: "Blocked by suspicious scan threshold",
      });

      await notifyHrBlockedScan({
        employeeCode: session.emp_id,
        suspicionScore: finalSuspicionScore,
        suspicionFlags: mergedFlags,
        timestamp: normalized.timestamp,
      });

      return Response.json({
        error: "SUSPICIOUS_SCAN_BLOCKED",
        status: "blocked",
        suspicionScore: finalSuspicionScore,
        suspicionFlags: mergedFlags,
      }, { status: 403 });
    }

    // ── Device binding check ──────────────────────────────────────────────────
    let boundDevice = null;
    try {
      boundDevice = await prisma.authEmployeeDevice.findFirst({
        where: { employee_id: employee.id },
        select: { id: true, device_id: true, is_active: true },
      });
    } catch (err) {
      return Response.json({ error: "DEVICE_QUERY_FAILED", detail: err.message }, { status: 500 });
    }

    if (!boundDevice) {
      try {
        await prisma.authEmployeeDevice.create({
          data: {
            employee_id: employee.id,
            device_id: deviceId,
            device_name: payload.device_name || null,
            is_active: true,
          },
        });
      } catch (err) {
        return Response.json({ error: "DEVICE_BIND_FAILED", detail: err.message }, { status: 500 });
      }
    } else if (boundDevice.is_active && boundDevice.device_id !== deviceId) {
      await logAttendanceScanAttempt({
        employee_id: employee.id,
        emp_code: session.emp_id,
        date: today,
        action_type: "scan_unknown",
        success: false,
        reason: "DEVICE_MISMATCH",
        latitude,
        longitude,
        accuracy_meters: accuracy || null,
        location_id: locationCheck.nearest?.id || null,
        distance_meters: locationCheck.nearest?.distance_meters || null,
        device_id: deviceId,
        ip_address: ip,
        user_agent: req.headers.get("user-agent") || null,
      });

      return Response.json({ error: "DEVICE_MISMATCH" }, { status: 403 });
    }

    // ── Attendance row lookup ─────────────────────────────────────────────────
    let row = null;
    try {
      row = await prisma.attendance.findFirst({
        where: { employee_id: employee.id, work_date: today },
      });
    } catch (err) {
      return Response.json({ error: "ATTENDANCE_QUERY_FAILED", detail: err.message }, { status: 500 });
    }

    const nowIso = new Date().toISOString();

    // ── Scan IN ───────────────────────────────────────────────────────────────
    if (!row) {
      const notesArr = [
        faceVerified ? "face_verified" : null,
        suspicionStatus === "flagged" ? "suspicious_scan_flagged" : null,
      ].filter(Boolean);

      let insertedAttendance;
      try {
        insertedAttendance = await prisma.attendance.create({
          data: {
            employee_id: employee.id,
            work_date: today,
            scan_in_time: new Date(nowIso),
            scan_in_latitude: latitude,
            scan_in_longitude: longitude,
            scan_in_location_id: locationCheck.nearest?.id || null,
            scan_in_photo_url: selfieUrl,
            scan_in_device_id: deviceId,
            status: "present",
            notes: notesArr.join(",") || null,
          },
        });
      } catch (err) {
        return Response.json({ error: "SCAN_IN_FAILED", detail: err.message }, { status: 500 });
      }

      await logAttendanceScanAttempt({
        employee_id: employee.id,
        emp_code: session.emp_id,
        date: today,
        action_type: "scan_in",
        success: true,
        reason: "OK",
        latitude,
        longitude,
        accuracy_meters: accuracy || null,
        location_id: locationCheck.nearest?.id || null,
        distance_meters: locationCheck.nearest?.distance_meters || null,
        device_id: deviceId,
        ip_address: ip,
        user_agent: req.headers.get("user-agent") || null,
      });

      await persistSuspiciousScan({
        employee,
        employeeCode: session.emp_id,
        attendanceId: insertedAttendance.id,
        timestamp: normalized.timestamp,
        latitude,
        longitude,
        accuracy,
        suspicionScore: finalSuspicionScore,
        suspicionFlags: mergedFlags,
        faceMatchScore: normalized.faceMatchScore,
        deviceId,
        scanStatus: suspicionStatus,
        reviewAction: suspicionStatus === "flagged" ? "pending" : "approved",
        reviewNote: suspicionStatus === "flagged" ? "Awaiting HR review" : "Auto-normal",
      });

      return Response.json({
        success: true,
        action: "scan_in",
        timestamp: nowIso,
        nearest: locationCheck.nearest,
        suspiciousStatus: suspicionStatus,
        suspicionScore: finalSuspicionScore,
        suspicionFlags: mergedFlags,
      });
    }

    // ── Already completed check ───────────────────────────────────────────────
    if (row.scan_out_time) {
      await logAttendanceScanAttempt({
        employee_id: employee.id,
        emp_code: session.emp_id,
        date: today,
        action_type: "scan_out",
        success: false,
        reason: "ALREADY_COMPLETED",
        latitude,
        longitude,
        accuracy_meters: accuracy || null,
        location_id: locationCheck.nearest?.id || null,
        distance_meters: locationCheck.nearest?.distance_meters || null,
        device_id: deviceId,
        ip_address: ip,
        user_agent: req.headers.get("user-agent") || null,
      });
      return Response.json({ error: "ALREADY_SCANNED_OUT" }, { status: 400 });
    }

    // ── Scan OUT ──────────────────────────────────────────────────────────────
    try {
      await prisma.attendance.update({
        where: { id: row.id },
        data: {
          scan_out_time: new Date(nowIso),
          scan_out_latitude: latitude,
          scan_out_longitude: longitude,
          scan_out_location_id: locationCheck.nearest?.id || null,
          scan_out_photo_url: selfieUrl,
          scan_out_device_id: deviceId,
        },
      });
    } catch (err) {
      return Response.json({ error: "SCAN_OUT_FAILED", detail: err.message }, { status: 500 });
    }

    await logAttendanceScanAttempt({
      employee_id: employee.id,
      emp_code: session.emp_id,
      date: today,
      action_type: "scan_out",
      success: true,
      reason: "OK",
      latitude,
      longitude,
      accuracy_meters: accuracy || null,
      location_id: locationCheck.nearest?.id || null,
      distance_meters: locationCheck.nearest?.distance_meters || null,
      device_id: deviceId,
      ip_address: ip,
      user_agent: req.headers.get("user-agent") || null,
    });

    await persistSuspiciousScan({
      employee,
      employeeCode: session.emp_id,
      attendanceId: row.id,
      timestamp: normalized.timestamp,
      latitude,
      longitude,
      accuracy,
      suspicionScore: finalSuspicionScore,
      suspicionFlags: mergedFlags,
      faceMatchScore: normalized.faceMatchScore,
      deviceId,
      scanStatus: suspicionStatus,
      reviewAction: suspicionStatus === "flagged" ? "pending" : "approved",
      reviewNote: suspicionStatus === "flagged" ? "Awaiting HR review" : "Auto-normal",
    });

    return Response.json({
      success: true,
      action: "scan_out",
      timestamp: nowIso,
      nearest: locationCheck.nearest,
      suspiciousStatus: suspicionStatus,
      suspicionScore: finalSuspicionScore,
      suspicionFlags: mergedFlags,
    });
  } catch (error) {
    console.error("[attendance/scan] unhandled error:", error instanceof Error ? error.message : String(error));
    return Response.json(
      { error: "INTERNAL_SERVER_ERROR", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
