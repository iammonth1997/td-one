/**
 * GPS Spoofing Detection - Usage Examples
 * Shows how to integrate the spoofing detection into your attendance flow
 */

import { calculateSuspicionScore, type GPSReading, type GPSSpoofingDetectionResult } from "@/lib/gpsSpoofingDetection";

/**
 * Example 1: Analyzing readings from a legitimate office location
 */
export async function exampleLegitimateGPS() {
  // Sample readings from someone at the office with real GPS
  const legitimateReadings: GPSReading[] = [
    {
      latitude: 13.7563,
      longitude: 100.5018,
      accuracy: 8.5, // Typical phone GPS accuracy
      altitude: 12,
      speed: 0,
      timestamp: 1710907200000,
    },
    {
      latitude: 13.75634,
      longitude: 100.50179,
      accuracy: 9.2,
      altitude: 11,
      speed: 0.1,
      timestamp: 1710907203000,
    },
    {
      latitude: 13.75631,
      longitude: 100.5018,
      accuracy: 8.8,
      altitude: 12,
      speed: 0,
      timestamp: 1710907206000,
    },
    {
      latitude: 13.75632,
      longitude: 100.50181,
      accuracy: 9.5,
      altitude: 11,
      speed: 0,
      timestamp: 1710907209000,
    },
    {
      latitude: 13.75633,
      longitude: 100.50179,
      accuracy: 8.9,
      altitude: 12,
      speed: 0,
      timestamp: 1710907212000,
    },
  ];

  const result = calculateSuspicionScore(legitimateReadings);
  console.log("Legitimate GPS Result:", result);
  // Expected: score 0-10, recommendation "pass"
  return result;
}

/**
 * Example 2: Analyzing readings from a spoofed GPS
 * Fake GPS apps typically lock coordinates and don't provide altitude
 */
export async function exampleSpoofedGPS() {
  // Sample readings from Fake GPS app (locked coordinates)
  const spoofedReadings: GPSReading[] = [
    {
      latitude: 13.7563,
      longitude: 100.5018,
      accuracy: 2.1, // Unrealistically high accuracy for mobile browser
      altitude: null, // Fake GPS apps often don't provide altitude
      speed: null,
      timestamp: 1710907200000,
    },
    {
      latitude: 13.7563,
      longitude: 100.5018,
      accuracy: 2.0,
      altitude: null,
      speed: null,
      timestamp: 1710907203000,
    },
    {
      latitude: 13.7563,
      longitude: 100.5018,
      accuracy: 2.1,
      altitude: null,
      speed: null,
      timestamp: 1710907206000,
    },
    {
      latitude: 13.7563,
      longitude: 100.5018,
      accuracy: 2.0,
      altitude: null,
      speed: null,
      timestamp: 1710907209000,
    },
    {
      latitude: 13.7563,
      longitude: 100.5018,
      accuracy: 2.1,
      altitude: null,
      speed: null,
      timestamp: 1710907212000,
    },
  ];

  const result = calculateSuspicionScore(spoofedReadings);
  console.log("Spoofed GPS Result:", result);
  // Expected: score 100+, recommendation "block"
  return result;
}

/**
 * Example 3: Integration into attendance scan endpoint
 * Shows how to use this in your LINE LIFF or web app attendance flow
 */
export async function attendanceScanWithGPSValidation(
  employeeId: string,
  gpsReadings: GPSReading[]
) {
  // Calculate spoofing risk
  const spoof Detection = calculateSuspicionScore(gpsReadings);

  // Log for audit trail
  console.log(`[${employeeId}] GPS Spoofing Check:`, {
    score: spoof Detection.score,
    recommendation: spoof Detection.recommendation,
    flags: spoof Detection.flags.map((f) => f.indicator),
  });

  // Make decision based on recommendation
  switch (spoof Detection.recommendation) {
    case "pass":
      // Proceed with attendance scan
      return {
        allowed: true,
        message: "Attendance recorded - GPS OK",
        spoof Detection,
      };

    case "suspicious":
      // Allow but flag for review and possibly require manual verification
      return {
        allowed: true,
        message: "⚠️ Attendance recorded but GPS appears suspicious - flagged for review",
        requiresManualReview: true,
        spoof Detection,
      };

    case "block":
      // Block attendance
      return {
        allowed: false,
        message: "❌ Attendance blocked - GPS spoofing detected. Please contact admin.",
        spoof Detection,
      };
  }
}

/**
 * Example 4: Frontend code for collecting GPS readings
 * Run this before attendance scan to collect 5 readings over ~12 seconds
 */
export async function collectGPSReadings(duration: number = 12000): Promise<GPSReading[]> {
  const readings: GPSReading[] = [];
  const startTime = Date.now();
  const interval = duration / 5; // Collect 5 readings

  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not available"));
      return;
    }

    const intervalId = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          readings.push({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            speed: position.coords.speed,
            timestamp: Date.now(),
          });

          if (readings.length >= 5) {
            clearInterval(intervalId);
            resolve(readings);
          }
        },
        (error) => {
          clearInterval(intervalId);
          reject(error);
        }
      );
    }, interval);

    // Safety timeout
    setTimeout(() => {
      clearInterval(intervalId);
      if (readings.length > 0) {
        resolve(readings);
      } else {
        reject(new Error("Failed to collect GPS readings"));
      }
    }, duration + 5000);
  });
}

/**
 * Example 5: React hook for attendance scanning with GPS check
 * Use this in your LINE LIFF or web app attendance interface
 */
export function useAttendanceWithGPSCheck() {
  return {
    /**
     * Start attendance scan with GPS spoofing check
     */
    async performScan() {
      try {
        // Request permission and collect GPS readings
        console.log("Collecting GPS data...");
        const readings = await collectGPSReadings(12000); // 12 seconds

        console.log("Analyzing GPS...");
        const detection = calculateSuspicionScore(readings);

        if (detection.recommendation === "block") {
          return {
            success: false,
            error: "GPS spoofing detected. Attendance cannot be recorded.",
            details: detection,
          };
        }

        // If we get here, GPS is OK (pass or suspicious but allowed)
        // Proceed with attendance recording
        return {
          success: true,
          readings,
          detection,
          message: detection.recommendation === "pass" ? "Attendance OK" : "⚠️ Attendance recorded with flags",
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "GPS check failed",
        };
      }
    },
  };
}
