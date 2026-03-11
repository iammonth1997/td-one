import { validateSession } from "@/lib/validateSession";
import {
  detectSuspiciousGps,
  getEmployeeFromSessionEmpId,
  getTodayDateInBangkok,
  logAttendanceScanAttempt,
  verifyWorkLocation,
} from "@/lib/attendanceUtils";
import { supabaseServer } from "@/lib/supabaseServer";
import { verifyAttendanceLiffBySession } from "@/lib/verifyAttendanceLiff";

function getClientIp(req) {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || req.headers.get("x-real-ip")
    || null;
}

export async function POST(req) {
  const { session, error: authError, status: authStatus } = await validateSession(req);
  if (authError) {
    return Response.json({ error: authError }, { status: authStatus });
  }

  const liffCheck = await verifyAttendanceLiffBySession(req, session.emp_id);
  if (!liffCheck.ok) {
    return Response.json({ error: liffCheck.error, detail: liffCheck.detail || null }, { status: liffCheck.status });
  }

  const payload = await req.json();
  const latitude = Number(payload.latitude);
  const longitude = Number(payload.longitude);
  const accuracy = Number(payload.accuracy || 0);
  const deviceId = String(payload.device_id || "").trim();
  const faceVerified = Boolean(payload.face_verified);
  const selfieUrl = payload.selfie_url || null;
  const fakeFlags = Array.isArray(payload.fake_flags) ? payload.fake_flags : [];

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || !deviceId) {
    return Response.json({ error: "INVALID_INPUT" }, { status: 400 });
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
    clientCapturedAt: payload.captured_at,
    clientFlags: fakeFlags,
  });

  if (fakeGps.suspicious) {
    await logAttendanceScanAttempt({
      employee_id: employee.id,
      emp_code: session.emp_id,
      date: today,
      action_type: "scan_unknown",
      success: false,
      reason: `SUSPICIOUS_GPS:${fakeGps.reasons.join("|")}`,
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
      error: "SUSPICIOUS_GPS",
      reasons: fakeGps.reasons,
    }, { status: 403 });
  }

  const { data: boundDevice, error: deviceError } = await supabaseServer
    .from("employee_devices")
    .select("id, device_id, is_active")
    .eq("employee_id", employee.id)
    .maybeSingle();

  if (deviceError) {
    return Response.json({ error: "DEVICE_QUERY_FAILED", detail: deviceError.message }, { status: 500 });
  }

  if (!boundDevice) {
    const { error: bindError } = await supabaseServer
      .from("employee_devices")
      .insert({
        employee_id: employee.id,
        device_id: deviceId,
        device_name: payload.device_name || null,
        is_active: true,
      });

    if (bindError) {
      return Response.json({ error: "DEVICE_BIND_FAILED", detail: bindError.message }, { status: 500 });
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

  const { data: row, error: rowError } = await supabaseServer
    .from("attendance")
    .select("*")
    .eq("employee_id", employee.id)
    .eq("date", today)
    .maybeSingle();

  if (rowError) {
    return Response.json({ error: "ATTENDANCE_QUERY_FAILED", detail: rowError.message }, { status: 500 });
  }

  const nowIso = new Date().toISOString();

  if (!row) {
    const insertPayload = {
      employee_id: employee.id,
      date: today,
      scan_in_time: nowIso,
      scan_in_latitude: latitude,
      scan_in_longitude: longitude,
      scan_in_location_id: locationCheck.nearest?.id || null,
      scan_in_photo_url: selfieUrl,
      scan_in_device_id: deviceId,
      status: "present",
      notes: faceVerified ? "face_verified" : null,
    };

    const { error: insertError } = await supabaseServer
      .from("attendance")
      .insert(insertPayload);

    if (insertError) {
      return Response.json({ error: "SCAN_IN_FAILED", detail: insertError.message }, { status: 500 });
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

    return Response.json({
      success: true,
      action: "scan_in",
      timestamp: nowIso,
      nearest: locationCheck.nearest,
    });
  }

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

  const { error: updateError } = await supabaseServer
    .from("attendance")
    .update({
      scan_out_time: nowIso,
      scan_out_latitude: latitude,
      scan_out_longitude: longitude,
      scan_out_location_id: locationCheck.nearest?.id || null,
      scan_out_photo_url: selfieUrl,
      scan_out_device_id: deviceId,
    })
    .eq("id", row.id);

  if (updateError) {
    return Response.json({ error: "SCAN_OUT_FAILED", detail: updateError.message }, { status: 500 });
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

  return Response.json({
    success: true,
    action: "scan_out",
    timestamp: nowIso,
    nearest: locationCheck.nearest,
  });
}
