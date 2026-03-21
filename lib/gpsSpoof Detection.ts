/**
 * GPS Spoofing Detection System
 * Analyzes GPS readings to detect fake GPS apps used to spoof attendance location
 */

/**
 * Represents a single GPS reading from the device
 */
export interface GPSReading {
  /** Latitude coordinate */
  latitude: number;
  /** Longitude coordinate */
  longitude: number;
  /** Accuracy in meters */
  accuracy: number | null;
  /** Altitude in meters */
  altitude: number | null;
  /** Speed in m/s */
  speed: number | null;
  /** Timestamp when reading was taken */
  timestamp: number;
}

/**
 * Represents detected spoofing indicators
 */
export interface SpoofingFlag {
  /** The indicator that was detected */
  indicator: string;
  /** Points added to score */
  points: number;
  /** Explanation of why this was flagged */
  description: string;
  /** Raw values for debugging */
  value?: any;
}

/**
 * GPS spoofing detection result
 */
export interface GPS SpoofingDetectionResult {
  /** Total suspicion score (0-100+) */
  score: number;
  /** Array of detected spoofing indicators */
  flags: SpoofingFlag[];
  /** Recommendation based on score */
  recommendation: "pass" | "suspicious" | "block";
  /** Human-readable summary */
  summary: string;
  /** Metadata for logging/debugging */
  metadata: {
    readingsCount: number;
    timeSpanSeconds: number;
    avgAccuracy: number | null;
    coordinateVariance: number;
  };
}

/**
 * Calculates suspicion score for GPS spoofing detection
 * Analyzes 5 GPS readings collected every 3 seconds before scan
 *
 * @param positions - Array of GPS readings to analyze
 * @returns {GPSSpoofingDetectionResult} Detection result with score and flags
 */
export function calculateSuspicionScore(positions: GPSReading[]): GPSSpoofingDetectionResult {
  const flags: SpoofingFlag[] = [];
  let score = 0;

  // Validation
  if (!Array.isArray(positions) || positions.length === 0) {
    return {
      score: 0,
      flags: [],
      recommendation: "pass",
      summary: "No GPS data to analyze",
      metadata: {
        readingsCount: 0,
        timeSpanSeconds: 0,
        avgAccuracy: null,
        coordinateVariance: 0,
      },
    };
  }

  // 1. Check accuracy < 5m (high accuracy suggests real GPS or spoofing app with good signal)
  // However, exceptionally high accuracy (< 5m) in mobile browser is suspicious
  const accuracyReadings = positions.filter((p) => p.accuracy !== null && p.accuracy !== undefined);
  if (accuracyReadings.length > 0) {
    const avgAccuracy = accuracyReadings.reduce((sum, p) => sum + (p.accuracy || 0), 0) / accuracyReadings.length;

    if (avgAccuracy < 5) {
      const points = 30;
      score += points;
      flags.push({
        indicator: "exceptional_accuracy",
        points,
        description: `Average accuracy ${avgAccuracy.toFixed(2)}m is unrealistically high for mobile browser GPS`,
        value: avgAccuracy,
      });
    }
  }

  // 2. Check altitude is null or 0 (fake GPS apps often don't provide altitude)
  const nullAltitudeCount = positions.filter(
    (p) => p.altitude === null || p.altitude === undefined || p.altitude === 0
  ).length;

  if (nullAltitudeCount === positions.length) {
    const points = 20;
    score += points;
    flags.push({
      indicator: "missing_altitude",
      points,
      description: "All readings missing altitude data (common in spoofed GPS)",
      value: nullAltitudeCount,
    });
  } else if (nullAltitudeCount > positions.length / 2) {
    const points = 10;
    score += points;
    flags.push({
      indicator: "inconsistent_altitude",
      points,
      description: `${nullAltitudeCount}/${positions.length} readings missing altitude`,
      value: nullAltitudeCount,
    });
  }

  // 3. Check speed is 0 or null (fake GPS doesn't simulate movement)
  const zeroSpeedCount = positions.filter((p) => p.speed === null || p.speed === undefined || p.speed === 0).length;

  if (zeroSpeedCount === positions.length) {
    const points = 20;
    score += points;
    flags.push({
      indicator: "zero_speed",
      points,
      description: "All readings show 0 or null speed (typical of fake GPS apps)",
      value: zeroSpeedCount,
    });
  }

  // 4. Check coordinate variance < 0.000001 (too stable = fake)
  // Variance this low over 5 readings in 12 seconds would indicate stationary device
  // but real GPS has jitter even when stationary
  const coordinateVariance = calculateCoordinateVariance(positions);

  if (coordinateVariance < 0.000001 && coordinateVariance > 0) {
    const points = 30;
    score += points;
    flags.push({
      indicator: "suspicious_stability",
      points,
      description: `Coordinate variance ${coordinateVariance.toFixed(
        8
      )} is suspiciously low (fake app may lock GPS signal)`,
      value: coordinateVariance,
    });
  }

  // Additional check: Sudden position jumps (indicator of app switching or teleporting)
  const maxDistance = calculateMaxDistanceBetweenReadings(positions);
  if (maxDistance > 50) {
    // Positions more than 50 meters apart in 12 seconds = ~15 m/s = teleportation
    const points = 25;
    score += points;
    flags.push({
      indicator: "position_jump",
      points,
      description: `Maximum distance between consecutive readings: ${maxDistance.toFixed(
        2
      )}m (suggests teleportation or app glitch)`,
      value: maxDistance,
    });
  }

  // Calculate metadata
  const timeSpan = positions[positions.length - 1].timestamp - positions[0].timestamp;
  const avgAccuracy =
    accuracyReadings.length > 0
      ? accuracyReadings.reduce((sum, p) => sum + (p.accuracy || 0), 0) / accuracyReadings.length
      : null;

  // Determine recommendation
  let recommendation: "pass" | "suspicious" | "block";
  let summary: string;

  if (score <= 30) {
    recommendation = "pass";
    summary = `GPS data appears legitimate (score: ${score})`;
  } else if (score <= 70) {
    recommendation = "suspicious";
    summary = `GPS data shows suspicious patterns (score: ${score}) - manual review recommended`;
  } else {
    recommendation = "block";
    summary = `GPS data highly suspicious of spoofing (score: ${score}) - attendance blocked`;
  }

  return {
    score,
    flags,
    recommendation,
    summary,
    metadata: {
      readingsCount: positions.length,
      timeSpanSeconds: Math.round(timeSpan / 1000),
      avgAccuracy,
      coordinateVariance,
    },
  };
}

/**
 * Calculates variance in coordinates across readings
 * Shows how much GPS coordinates drift naturally
 * Real GPS shows some variance even when stationary (typical 5-20m jitter)
 *
 * @param positions - Array of GPS readings
 * @returns {number} Variance of coordinates
 */
function calculateCoordinateVariance(positions: GPSReading[]): number {
  if (positions.length < 2) return 0;

  // Calculate mean coordinates
  const meanLat = positions.reduce((sum, p) => sum + p.latitude, 0) / positions.length;
  const meanLng = positions.reduce((sum, p) => sum + p.longitude, 0) / positions.length;

  // Calculate variance
  const variance = positions.reduce((sum, p) => {
    const latDiff = p.latitude - meanLat;
    const lngDiff = p.longitude - meanLng;
    return sum + latDiff * latDiff + lngDiff * lngDiff;
  }, 0) / positions.length;

  return variance;
}

/**
 * Calculates maximum distance between consecutive GPS readings in meters
 * using Haversine formula
 *
 * @param positions - Array of GPS readings
 * @returns {number} Maximum distance in meters
 */
function calculateMaxDistanceBetweenReadings(positions: GPSReading[]): number {
  if (positions.length < 2) return 0;

  let maxDistance = 0;

  for (let i = 0; i < positions.length - 1; i++) {
    const distance = haversineDistance(
      positions[i].latitude,
      positions[i].longitude,
      positions[i + 1].latitude,
      positions[i + 1].longitude
    );

    maxDistance = Math.max(maxDistance, distance);
  }

  return maxDistance;
}

/**
 * Calculates distance between two coordinates using Haversine formula
 *
 * @param lat1 - Latitude of first point
 * @param lng1 - Longitude of first point
 * @param lat2 - Latitude of second point
 * @param lng2 - Longitude of second point
 * @returns {number} Distance in meters
 */
function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}
