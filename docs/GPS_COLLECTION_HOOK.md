# GPS Pre-Scan Collection Hook

React hook for collecting GPS readings before attendance scanning with built-in spoofing detection.

## Overview

`useGPSCollection` is a React custom hook that:
- Collects 5 GPS readings over ~15 seconds (every 3 seconds)
- Shows progress to user (1/5, 2/5, etc.)
- Automatically calculates spoofing suspicion score
- Blocks scan button until collection is complete
- Handles all geolocation errors gracefully

**Tech Stack:** React 16.8+ | TypeScript | Browser Geolocation API

## Features

✅ **Automatic Collection** — Collects readings at configurable intervals
✅ **Progress Tracking** — Shows user how many readings collected
✅ **Error Recovery** — Uses last known position if reading fails
✅ **Timeout Safety** — Completes with partial data if timeout occurs
✅ **Cleanup** — Properly cancels timers on unmount
✅ **Callbacks** — onProgress, onComplete, onError events
✅ **Accessibility** — Works on all modern browsers with geolocation support

## Installation

The hook is in `lib/useGPSCollection.ts`. Import and use it in your component:

```typescript
import { useGPSCollection } from "@/lib/useGPSCollection";
```

## API

### Hook Signature

```typescript
function useGPSCollection(config?: GPSCollectionConfig): {
  // State
  isReady: boolean;
  suspicionResult: GPSSpoofingDetectionResult | null;
  positions: GPSReading[];
  progress: number;
  error: string | null;
  isCollecting: boolean;

  // Controls
  start: () => Promise<void>;
  cancel: () => void;
  reset: () => void;

  // Computed values
  estimatedRemainingTime: number;
  progressPercentage: number;
}
```

### Configuration Interface

```typescript
interface GPSCollectionConfig {
  // Number of GPS readings to collect (default: 5)
  readingsCount?: number;

  // Interval between readings in ms (default: 3000 = 3 seconds)
  readingInterval?: number;

  // Total collection time in ms (default: 15000 = 15 seconds)
  totalDuration?: number;

  // Automatically start on component mount (default: false)
  autoStart?: boolean;

  // Callback when collection completes successfully
  onComplete?: (state: GPSCollectionState) => void;

  // Callback when error occurs
  onError?: (error: string) => void;

  // Callback when progress changes (0-5)
  onProgress?: (progress: number) => void;
}
```

### Return State

```typescript
interface GPSCollectionState {
  // Whether collection is complete and ready for scan
  isReady: boolean;

  // Suspicion detection result (null until ready)
  suspicionResult: GPSSpoofingDetectionResult | null;

  // Array of collected GPS readings
  positions: GPSReading[];

  // Current progress (0-5)
  progress: number;

  // Error message if collection failed
  error: string | null;

  // Whether currently collecting GPS data
  isCollecting: boolean;
}
```

### Return Methods

```typescript
// Start GPS collection (auto-collects 5 readings)
start(): Promise<void>;

// Cancel ongoing collection
cancel(): void;

// Reset all state (ready for new collection)
reset(): void;
```

### Computed Values

```typescript
// Time remaining in milliseconds (for display)
estimatedRemainingTime: number;

// Progress as percentage (0-100) for progress bars
progressPercentage: number;
```

## Usage Examples

### Basic Usage

```typescript
import { useGPSCollection } from "@/lib/useGPSCollection";

export function ScanButton() {
  const gps = useGPSCollection();

  return (
    <>
      {/* Show progress while collecting */}
      {gps.isCollecting && (
        <div>
          Collecting GPS... {gps.progress}/5
        </div>
      )}

      {/* Prepare button (triggers collection) */}
      <button onClick={gps.start} disabled={gps.isCollecting}>
        Prepare Scan
      </button>

      {/* Scan button (only enabled when ready) */}
      <button onClick={submitScan} disabled={!gps.isReady}>
        Check In
      </button>
    </>
  );
}
```

### With Configuration

```typescript
const gps = useGPSCollection({
  readingsCount: 5,           // Collect 5 readings
  readingInterval: 3000,      // Every 3 seconds
  totalDuration: 15000,       // Complete within 15 seconds
  autoStart: false,           // Manual start
  onProgress: (progress) => {
    console.log(`Collected ${progress}/5 readings`);
  },
  onComplete: (state) => {
    console.log("GPS ready:", state.suspicionResult?.recommendation);
  },
  onError: (error) => {
    console.error("GPS failed:", error);
  },
});
```

### Progress Display

```typescript
function ProgressIndicator() {
  const gps = useGPSCollection();

  return (
    <div>
      {/* Text progress */}
      <span>{gps.progress}/{5}</span>

      {/* Progress bar */}
      <progress value={gps.progress} max={5} />

      {/* Percentage */}
      <span>{gps.progressPercentage.toFixed(0)}%</span>

      {/* Time remaining */}
      <span>{Math.ceil(gps.estimatedRemainingTime / 1000)}s</span>
    </div>
  );
}
```

### Error Handling

```typescript
function ScanForm() {
  const gps = useGPSCollection();

  if (gps.error) {
    return (
      <div style={{ color: "red" }}>
        <p>⚠️ {gps.error}</p>
        <button onClick={gps.reset}>Try Again</button>
      </div>
    );
  }

  // ... rest of component
}
```

### Full Attendance Form

```typescript
import { useGPSCollection } from "@/lib/useGPSCollection";

export function AttendanceScanner() {
  const [submitting, setSubmitting] = useState(false);
  const gps = useGPSCollection({
    readingsCount: 5,
    readingInterval: 3000,
  });

  const handleScan = async (action: "checkin" | "checkout") => {
    // First, check if GPS is ready
    if (!gps.isReady) {
      // Start collection if not already started
      if (!gps.isCollecting) {
        await gps.start();
      }
      return; // Will try again after collection
    }

    // GPS is ready, submit attendance
    setSubmitting(true);
    try {
      const res = await fetch("/api/attendance/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          positions: gps.positions,
          spoofing_score: gps.suspicionResult?.score,
        }),
      });

      if (res.ok) {
        alert(`${action} successful!`);
        gps.reset();
      } else {
        alert("Scan failed. Try again.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      {/* Status Display */}
      {gps.isCollecting && (
        <div>
          <p>Preparing scan... {gps.progress}/5</p>
          <progress value={gps.progress} max={5} />
        </div>
      )}

      {gps.isReady && (
        <p>✓ GPS verified - ready to scan</p>
      )}

      {gps.error && (
        <p style={{ color: "red" }}>Error: {gps.error}</p>
      )}

      {/* Action Buttons */}
      <button
        onClick={() => handleScan("checkin")}
        disabled={submitting}
      >
        {gps.isCollecting ? "Preparing..." : "Check In"}
      </button>

      <button
        onClick={() => handleScan("checkout")}
        disabled={submitting}
      >
        {gps.isCollecting ? "Preparing..." : "Check Out"}
      </button>
    </div>
  );
}
```

## How It Works

### Collection Flow

1. **User clicks "Prepare Scan"** → `gps.start()` is called
2. **First reading collected immediately** → progress = 1/5
3. **Subsequent readings every 3 seconds** → progress increments
4. **After 5 readings collected** → `calculateSuspicionScore()` runs
5. **State becomes `isReady = true`** → Scan button enabled
6. **User clicks "Check In/Out"** → Submit with `gps.positions`

### Geolocation Handling

```
Request Permission → Get Position → Bundle with metadata → Store
     ↓                     ↓
User Allow         5 readings over 15s
                        ↓
                   Auto-cancel after 20s
                   (timeout safety)
```

### Error Recovery

- **No permission** → Show error, allow retry
- **Location unavailable** → Use last known position
- **Timeout** → Complete with partial data
- **Partial collection** → Calculate score with available readings

## Accessibility & UX

### Permission Handling

The hook requests location permission on first `start()` call:

```
Browser shows: "Allow location access?"
User allows → Collection begins
User denies → Error: "Geolocation permission denied"
```

### User Messaging

```
State                  Message
────────────────────────────────────────
Initial                "Click 'Prepare Scan'"
Collecting 1/5         "Collecting GPS... 1/5 (12s remaining)"
Collecting 3/5         "Collecting GPS... 3/5 (9s remaining)"
Ready                  "✓ GPS verified - ready to scan"
Error                  "⚠️ Failed to collect GPS data..."
```

## Performance

| Metric | Value |
|--------|-------|
| **Collection time** | ~15 seconds (5 readings × 3 second interval) |
| **Memory per reading** | ~200 bytes |
| **Total memory (5 readings)** | ~1 KB |
| **CPU usage** | Minimal (just browser geolocation) |
| **Network usage** | None (all client-side) |

## Browser Support

✅ Works in all modern browsers with Geolocation API:
- Chrome/Edge 50+
- Firefox 24+
- Safari 5.1+
- iOS Safari 10.3+
- Android Browser 50+

❌ Does not work in:
- HTTP pages (only HTTPS)
- Private browsing (some browsers)
- Pages without location permission

## Common Issues & Solutions

### Issue: "Permission Denied"

**Cause:** User denied location permission or site not HTTPS

**Solution:**
1. Ensure site is on HTTPS
2. Check browser location permissions (Settings)
3. Allow geolocation for your domain

### Issue: "Location Unavailable"

**Cause:** GPS signal weak or user hasn't moved

**Solution:**
- Collection continues with fallback positions
- Suspicious score may increase
- Still allows scan to proceed

### Issue: "Timed Out"

**Cause:** GPS took too long to get readings

**Solution:**
- Hook uses last position as fallback
- Collection completes with partial data
- Warning shown to user

### Issue: "Hook doesn't start collecting"

**Cause:** Forgot to call `gps.start()` or `autoStart: true` not set

**Solution:**
```typescript
// Option 1: Call start() manually
<button onClick={gps.start}>Prepare</button>

// Option 2: Auto-start on mount
const gps = useGPSCollection({ autoStart: true });
```

## Integration with Spoofing Detection

The hook **automatically** runs spoofing analysis:

```typescript
// After collection completes
gps.suspicionResult = calculateSuspicionScore(gps.positions);

// Use the result
if (gps.suspicionResult?.recommendation === "block") {
  // Block attendance
} else if (gps.suspicionResult?.recommendation === "suspicious") {
  // Flag for review
} else {
  // Allow scan
}
```

## Best Practices

1. **Collect before showing confirm button**
   ```typescript
   <button disabled={!gps.isReady}>Confirm</button>
   ```

2. **Always handle errors**
   ```typescript
   if (gps.error) return <ErrorMessage error={gps.error} />;
   ```

3. **Show progress to users**
   ```typescript
   {gps.isCollecting && <ProgressBar progress={gps.progress} />}
   ```

4. **Reset after successful submission**
   ```typescript
   if (response.ok) gps.reset();
   ```

5. **Warn about suspicious GPS**
   ```typescript
   if (gps.suspicionResult?.recommendation === "suspicious") {
     showWarning("GPS appears unusual");
   }
   ```

## Files

- `lib/useGPSCollection.ts` - Hook implementation
- `lib/useGPSCollection.example.tsx` - 4 complete example components
- `docs/GPS_SPOOFING_DETECTION.md` - Full spoofing detection guide

## See Also

- [GPS Spoofing Detection](GPS_SPOOFING_DETECTION.md) - Detection algorithms
- [Internal Network Detection](../lib/gpsSpoofingDetection.ts) - Network check
