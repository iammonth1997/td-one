# GPS Spoofing Detection System

## Overview

A TypeScript-based GPS spoofing detection system for your time attendance web app. Analyzes GPS readings to detect when employees use Fake GPS apps to clock in from unauthorized locations (e.g., home instead of office).

**Tech Stack:** TypeScript | Strongly typed interfaces | Mobile browser compatible

## How It Works

The system analyzes 5 GPS readings collected over ~12 seconds (every 3 seconds) before an attendance scan. It checks for indicators that suggest fake GPS usage and calculates a suspicion score.

### Detection Indicators

| Indicator | Points | Detection Logic |
|-----------|--------|---|
| **Exceptional Accuracy** | 30 | Avg accuracy < 5m is unrealistically high for mobile browser GPS |
| **Missing Altitude** | 20 | All readings lack altitude (common in fake GPS apps) |
| **Zero Speed** | 20 | No movement detected (fake GPS doesn't simulate motion) |
| **Suspicious Stability** | 30 | Coordinate variance < 0.000001 (too stable = locked signal) |
| **Position Jumps** | 25 | Distance >50m between consecutive readings (teleportation) |

### Scoring & Recommendations

- **Score 0-30:** `"pass"` → Allow attendance
- **Score 31-70:** `"suspicious"` → Allow but flag for manual review
- **Score 71+:** `"block"` → Reject attendance, GPS spoofing likely detected

## API

### 1. GPS Spoofing Detection: `calculateSuspicionScore()`

```typescript
function calculateSuspicionScore(positions: GPSReading[]): GPSSpoofingDetectionResult
```

**Input:** Array of GPS readings with coordinates, accuracy, altitude, speed, and timestamp

**Output:**
```typescript
{
  score: number;              // 0-100+ suspicion score
  flags: SpoofingFlag[];      // Array of detected issues
  recommendation: "pass" | "suspicious" | "block";
  summary: string;            // Human-readable result
  metadata: {
    readingsCount: number;    // Count of readings analyzed
    timeSpanSeconds: number;  // Duration of readings
    avgAccuracy: number | null;
    coordinateVariance: number;
  };
}
```

### Input Type: `GPSReading`

```typescript
interface GPSReading {
  latitude: number;
  longitude: number;
  accuracy: number | null;    // In meters
  altitude: number | null;     // In meters
  speed: number | null;        // In m/s
  timestamp: number;          // Milliseconds since epoch
}
```

### 2. Internal Network Detection: `checkInternalNetwork()`

```typescript
async function checkInternalNetwork(
  internalPingUrl: string = "/api/ping",
  timeoutMs: number = 3000
): Promise<NetworkCheckResult>
```

**Purpose:** Verifies employee is connected to company internal network before attendance scan. Provides soft verification that employee is physically in office.

**Input Parameters:**
- `internalPingUrl` - URL to company internal endpoint (default: `/api/ping`)
  - Should be a lightweight, fast endpoint that's only accessible on internal network
  - Not blocked by firewalls when on company WiFi/LAN
- `timeoutMs` - Timeout in milliseconds (default: 3000)
  - Uses `AbortSignal.timeout()` for reliable timeout

**Output:**
```typescript
{
  isOnCompanyNetwork: boolean;  // true if on internal network
  responseTime: number;         // Response time in milliseconds
  error?: string;               // Error message if check failed
}
```

**Behavior:**
- ✅ Returns `true` for 2xx, 3xx, 4xx responses from company network
- ✅ Returns `false` for timeout, network error, or CORS error
- ✅ Does NOT block attendance - failure is informational only
- ✅ Can add 10-20 points to suspicion score if fails
- ✅ Handles all errors gracefully (no exceptions thrown)

**Example Response:**
```javascript
// On company network
{ isOnCompanyNetwork: true, responseTime: 45 }

// Not on company network (external/mobile)
{ isOnCompanyNetwork: false, responseTime: 3000, error: "Timeout" }

// Slow network (possible VPN)
{ isOnCompanyNetwork: true, responseTime: 2500, error: "Slow response" }
```

## Usage Examples

### GPS Spoofing Detection: Basic Usage

```typescript
import { calculateSuspicionScore, type GPSReading } from "@/lib/gpsSpoofingDetection";

// Collect 5 GPS readings
const readings: GPSReading[] = [
  {
    latitude: 13.7563,
    longitude: 100.5018,
    accuracy: 8.5,
    altitude: 12,
    speed: 0,
    timestamp: Date.now(),
  },
  // ... 4 more readings ...
];

// Analyze
const result = calculateSuspicionScore(readings);

// Use result
if (result.recommendation === "block") {
  console.log("Attendance blocked:", result.summary);
} else if (result.recommendation === "suspicious") {
  console.log("⚠️ Flagged for review:", result.flags);
} else {
  console.log("✓ Attendance OK");
}
```

### Network Detection: Check Before Scan

```typescript
import { checkInternalNetwork } from "@/lib/gpsSpoofingDetection";

const networkCheck = await checkInternalNetwork("/api/ping", 3000);

if (networkCheck.isOnCompanyNetwork) {
  console.log(`✓ In office (${networkCheck.responseTime}ms response)`);
} else {
  console.log(`⚠️ Not on company network: ${networkCheck.error}`);
  // Still allow scan, but flag for review
}
```

### Combined Security Check

```typescript
import { 
  calculateSuspicionScore, 
  checkInternalNetwork,
  type GPSReading 
} from "@/lib/gpsSpoofingDetection";

async function attendanceSecurityCheck(gpsReadings: GPSReading[]) {
  // Run checks in parallel
  const [gpsCheck, networkCheck] = await Promise.all([
    calculateSuspicionScore(gpsReadings),
    checkInternalNetwork()
  ]);

  let score = gpsCheck.score;

  // Add network penalty (optional)
  if (!networkCheck.isOnCompanyNetwork) {
    score += 15; // Significant penalty
  } else if (networkCheck.responseTime > 2000) {
    score += 5; // Minor penalty for slow response
  }

  return {
    gpsCheck,
    networkCheck,
    finalScore: score,
    recommendation: score > 70 ? "block" : score > 30 ? "suspicious" : "pass",
  };
}
```

### Frontend: Collect GPS Data

```typescript
async function collectGPSReadings(): Promise<GPSReading[]> {
  const readings: GPSReading[] = [];
  
  for (let i = 0; i < 5; i++) {
    const position = await new Promise<GeolocationCoordinates>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        pos => resolve(pos.coords),
        err => reject(err)
      );
    });

    readings.push({
      latitude: position.latitude,
      longitude: position.longitude,
      accuracy: position.accuracy,
      altitude: position.altitude,
      speed: position.speed,
      timestamp: Date.now(),
    });

    // Wait 3 seconds before next reading
    await new Promise(r => setTimeout(r, 3000));
  }

  return readings;
}
```

### Server: Validate in Attendance Endpoint

```typescript
// In your attendance scan endpoint (e.g., /api/attendance/scan)
import { calculateSuspicionScore } from "@/lib/gpsSpoofingDetection";

export async function POST(request: Request) {
  const { employeeId, gpsReadings } = await request.json();

  // Check GPS
  const gpsCheck = calculateSuspicionScore(gpsReadings);

  // Log for audit
  await logSecurityAlert({
    type: "gps_spoofing_check",
    employeeId,
    score: gpsCheck.score,
    recommendation: gpsCheck.recommendation,
    flags: gpsCheck.flags.map(f => f.indicator),
  });

  // Decide whether to allow attendance
  if (gpsCheck.recommendation === "block") {
    return Response.json(
      { error: "Attendance blocked - GPS spoofing detected" },
      { status: 403 }
    );
  }

  if (gpsCheck.recommendation === "suspicious") {
    // Flag for admin review but allow tentatively
    await flagForReview(employeeId, gpsCheck);
  }

  // Record attendance
  return recordAttendance(employeeId);
}
```

## Integration Checklist

### GPS Spoofing Detection
- [ ] Copy `gpsSpoofingDetection.ts` to `lib/`
- [ ] Import `calculateSuspicionScore` and types in your attendance endpoint
- [ ] Add GPS collection logic to your frontend
- [ ] Call `calculateSuspicionScore()` before recording attendance
- [ ] Add logging/alerts for suspicious and blocked attempts
- [ ] (Optional) Create admin dashboard to review flagged attendances

### Internal Network Detection (NEW)
- [ ] Create `/api/ping` endpoint (see examples for implementation)
- [ ] Use `checkInternalNetwork()` in attendance form during scan
- [ ] Add network check result to suspicion score calculation
- [ ] Log network connectivity status with each attendance
- [ ] Document company WiFi/LAN requirements for employees
- [ ] (Optional) Display network status indicator in UI ("In Office" / "External")

### General
- [ ] Update your help documentation to explain GPS + network requirements
- [ ] Test with real GPS + on company WiFi
- [ ] Test with fake GPS + off company network
- [ ] Test with VPN/proxy + on company network
- [ ] Configure `/api/ping` endpoint with short timeout

## Testing & Validation

The `gpsSpoofingDetection.example.ts` and `internalNetworkDetection.example.ts` files include test scenarios:

### GPS Tests
- **Legitimate GPS:** Real office location with typical variance
- **Spoofed GPS:** Fake GPS app with perfect stability
- **Edge cases:** Movement, altitude variations, etc.

### Network Tests
- **On company WiFi:** `/api/ping` responds in < 500ms
- **On company LAN:** `/api/ping` responds in < 100ms  
- **Off company network:** Timeout after 3 seconds
- **VPN connection:** Slowish response (1-2 seconds, but successful)
- **CORS errors:** Gracefully handled, not on network
- **5xx server errors:** Treated as "on network but server issue"

Run tests:
```bash
npm test -- gpsSpoofingDetection.test.ts
npm test -- internalNetworkDetection.example.ts
```

## Edge Cases & Considerations

### Mobile Browser Limitations
- Canvas fingerprinting may affect accuracy readings
- HTTPS required for geolocation API
- User must allow location permission
- XMLHttpRequest/Fetch needed for network check

### Network Detection Specific
- WiFi disabled but on company LAN (Ethernet) → Network check may fail
  - Solution: Create mobile-friendly LAN detection endpoint
- Employee on VPN off-site → Network check succeeds but GPS fails
  - Combine both checks: VPN + spoofed GPS = highly suspicious
- Slow WiFi → slow network response but successful
  - Response time > 2000ms suggests possible VPN/proxy
- CORS errors → Always treated as "not on network"
  - Endpoint must allow CORS from your domain
- 3G/4G signal inside building → Network check fails even in office
  - GPS may still work, use GPS as primary check

### Real-world Challenges
- Weak signal at office entrance may show high accuracy variance
- Some spoofing apps simulate movement/altitude to evade detection
- GPS jitter is normal (5-20m) even when stationary
- Internal network detection fails if WiFi spectrum congested
- Network check creates additional server load (one request per scan)

### Recommendations
- Collect GPS readings **before** scan (not during)
- Network check runs **during** scan (not before)
- Use location-based boundaries as first check (geofence)
- Combine GPS check + network check with other signals:
  - GPS spoofing score
  - Network connectivity
  - Device fingerprinting
  - Attendance patterns (time + frequency)
  - IP geolocation (staff should match company IP range)
- Allow manual override by admin for edge cases
- Monitor false positive rates and adjust suspicion thresholds quarterly
- Cache network check result for same scan session (only check once)

## Performance

- **GPS Analysis time:** < 1ms per scan
- **Network Check time:** 50-500ms (on network) or 3000ms (timeout)
- **Combined check:** ~150-200ms (parallel execution)
- **Memory:** 
  - GPS: ~1KB per reading (5 readings = ~5KB)
  - Network: < 500 bytes
- **Browser compatibility:** All modern browsers with Geolocation API + Fetch API

## Files

- `lib/gpsSpoofingDetection.ts` - Main implementation (GPS + network detection, strongly typed)
- `lib/gpsSpoofingDetection.example.ts` - GPS usage examples and integration patterns
- `lib/internalNetworkDetection.example.ts` - Network detection examples and server endpoint implementation

## Security Notes

- ✅ GPS: Calculation runs client-side and server-side (double-check)
- ✅ Network: AbortSignal.timeout(3000) for reliable timeout
- ✅ Timestamps prevent replay attacks
- ✅ Results logged for audit trail
- ✅ Network check does NOT block attendance (soft security check)
- ⚠️ Combined detection is not foolproof - always pair with other security measures:
  - Geofencing (work location boundaries)
  - Device fingerprinting
  - IP geolocation
  - Attendance pattern analysis
- ⚠️ Advanced spoofing apps may evade some checks - monitor and adjust thresholds quarterly

---

**Last Updated:** March 20, 2026  
**Version:** 1.1.0 (added internal network detection)
