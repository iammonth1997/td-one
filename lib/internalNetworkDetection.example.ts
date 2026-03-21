/**
 * Internal Network Detection - Integration Examples
 * Shows how to use network detection in attendance scanning flow
 */

import { checkInternalNetwork, type NetworkCheckResult } from "@/lib/gpsSpoofingDetection";

/**
 * Example 1: Basic network check
 */
export async function exampleBasicNetworkCheck() {
  const result = await checkInternalNetwork();
  console.log("Network check:", result);
  /*
  Expected result when on company network:
  {
    isOnCompanyNetwork: true,
    responseTime: 45
  }

  Expected result when NOT on company network:
  {
    isOnCompanyNetwork: false,
    responseTime: 3000,
    error: "Timeout: no response from internal network"
  }
  */
}

/**
 * Example 2: Custom endpoint and timeout
 */
export async function exampleCustomEndpoint() {
  // Use your own internal health-check endpoint
  const result = await checkInternalNetwork("/api/health", 5000);

  if (result.isOnCompanyNetwork) {
    console.log(`✓ On company network (${result.responseTime}ms)`);
  } else {
    console.log(`✗ Not on company network: ${result.error}`);
  }
}

/**
 * Example 3: Integration into attendance scan flow
 * This shows how to use network check as a supplementary security measure
 */
export async function attendanceScanWithNetworkCheck(
  employeeId: string,
  gpsReadings: any[]
) {
  // Run network check in parallel with GPS check
  const [networkCheck, gpsAnalysis] = await Promise.all([
    checkInternalNetwork(),
    // ... GPS analysis would happen here
  ]);

  // Log for audit trail
  console.log(`[${employeeId}] Network Check:`, {
    onNetwork: networkCheck.isOnCompanyNetwork,
    responseTime: networkCheck.responseTime,
    error: networkCheck.error,
  });

  // Network check is informational - doesn't block scanning
  // Add points to GPS suspicion if network check failed
  if (!networkCheck.isOnCompanyNetwork) {
    console.log("⚠️ Network check failed - employee may not be in office");
    // Could add 15-20 points to suspicion score
  } else if (networkCheck.responseTime > 2000) {
    console.log("⚠️ Slow network response - possible remote access");
    // Could add 5-10 points to suspicion score
  } else {
    console.log("✓ Network check passed - likely in office");
  }

  // Attendance is still recorded regardless
  return {
    allowed: true,
    networkCheck,
    message: networkCheck.isOnCompanyNetwork
      ? "✓ Confirmed in office (network + GPS)"
      : "⚠️ Not detected on company network (GPS only)",
  };
}

/**
 * Example 4: Frontend implementation in React/TypeScript
 */
export function useNetworkCheck() {
  return {
    /**
     * Check network connectivity before/during attendance scan
     */
    async checkBeforeScan() {
      try {
        const result = await checkInternalNetwork("/api/ping", 3000);

        return {
          success: true,
          onNetwork: result.isOnCompanyNetwork,
          responseTime: result.responseTime,
          message: result.isOnCompanyNetwork
            ? "Connected to company network"
            : "Not detected on company network - external access?",
        };
      } catch (error) {
        return {
          success: false,
          error:
            error instanceof Error ? error.message : "Network check failed",
        };
      }
    },
  };
}

/**
 * Example 5: Add network suspicion to GPS score
 */
export function calculateNetworkSuspicionPoints(
  networkCheck: NetworkCheckResult
): number {
  let points = 0;

  // Not on network = high suspicion
  if (!networkCheck.isOnCompanyNetwork) {
    points += 20; // GPS spoofing already has 20 for zero speed
  }
  // Slow response = moderate suspicion (possible VPN/proxy)
  else if (networkCheck.responseTime > 2000) {
    points += 10;
  }
  // Normal response = no additional points
  // Fast response < 500ms = actually good sign
  else if (networkCheck.responseTime < 500) {
    points -= 5; // Slight reduction for fast response
  }

  return Math.max(0, points);
}

/**
 * Example 6: Server-side endpoint that implements network ping
 */
export async function examplePingEndpoint(request: Request) {
  // This is what /api/ping endpoint might look like
  // Place this in your server-side API routes

  if (request.method !== "GET") {
    return new Response(JSON.stringify({ error: "METHOD_NOT_ALLOWED" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Check if this is a network check request
  const isNetworkCheck = request.headers.get("X-Network-Check") === "true";

  if (isNetworkCheck) {
    // Fast response for network checks
    return new Response(
      JSON.stringify({
        status: "pong",
        timestamp: Date.now(),
        serverTime: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          // Allow cross-origin requests from your domain
          "Access-Control-Allow-Origin": "https://your-domain",
          "Access-Control-Allow-Methods": "GET",
          "Access-Control-Allow-Headers": "X-Network-Check",
          // Disable caching so we get a fresh check each time
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  }

  // Regular health check response
  return new Response(
    JSON.stringify({
      status: "healthy",
      timestamp: Date.now(),
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }
  );
}

/**
 * Example 7: Combined security check
 * Runs GPS spoofing check + network check together
 */
export async function comprehensiveSecurityCheck(
  employeeId: string,
  gpsReadings: any[],
  options: {
    internalPingUrl?: string;
    networkTimeoutMs?: number;
  } = {}
) {
  // Parallel execution for performance
  const [networkCheck, gpsCheck] = await Promise.all([
    checkInternalNetwork(
      options.internalPingUrl,
      options.networkTimeoutMs
    ),
    // Import this from gpsSpoofingDetection
    // calculateSuspicionScore(gpsReadings),
  ]);

  // Calculate combined suspicion
  let totalSuspicion = 0; // Start from base GPS score

  // Add network suspicion
  totalSuspicion += calculateNetworkSuspicionPoints(networkCheck);

  console.log(`[${employeeId}] Security Assessment:`, {
    network: {
      onNetwork: networkCheck.isOnCompanyNetwork,
      responseTime: networkCheck.responseTime,
    },
    gps: {
      // score: gpsCheck.score,
      // recommendation: gpsCheck.recommendation,
    },
    combined: {
      suspicion: totalSuspicion,
      canAttendance: totalSuspicion < 70, // Example threshold
    },
  });

  return {
    allowed: totalSuspicion < 70,
    networkCheck,
    // gpsCheck,
    suspicionScore: totalSuspicion,
  };
}

/**
 * Example 8: Graceful fallback when network check unavailable
 */
export async function networkCheckWithFallback(
  internalPingUrl: string,
  fallbackAction: () => void
) {
  try {
    const result = await checkInternalNetwork(internalPingUrl, 3000);

    if (!result.isOnCompanyNetwork) {
      console.warn(
        "Network check failed:",
        result.error || "No company network response"
      );
      fallbackAction();
    }

    return result;
  } catch (error) {
    console.error("Network check exception:", error);
    // If network check itself fails, don't block attendance
    // But log the failure for debugging
    fallbackAction();

    return {
      isOnCompanyNetwork: false,
      responseTime: 0,
      error: "Network check failed - falling back to GPS only",
    };
  }
}
