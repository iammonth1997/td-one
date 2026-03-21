/**
 * GPS Collection Usage Examples
 * React components showing integration with attendance scanning flow
 */

import React, { useState } from "react";
import { useGPSCollection } from "@/lib/useGPSCollection";

/**
 * Example 1: Simple GPS Collection Component
 * Shows progress and allows scan once collection is complete
 */
export function SimpleGPSCollection() {
  const gps = useGPSCollection({
    readingsCount: 5,
    readingInterval: 3000,
    onProgress: (progress) => {
      console.log(`GPS collection progress: ${progress}/5`);
    },
    onComplete: (state) => {
      console.log("GPS collection complete:", state.suspicionResult);
    },
    onError: (error) => {
      console.error("GPS error:", error);
    },
  });

  return (
    <div style={{ padding: "20px", border: "1px solid #ccc" }}>
      <h3>GPS Pre-Scan Collection</h3>

      {gps.isCollecting && (
        <div>
          <p>
            Collecting GPS data... <strong>{gps.progress}/5</strong>
          </p>
          <progress value={gps.progress} max={5} style={{ width: "100%" }} />
          <p>
            {Math.ceil(gps.estimatedRemainingTime / 1000)} seconds remaining
          </p>
        </div>
      )}

      {gps.isReady && (
        <div style={{ color: "green" }}>
          <p>✓ GPS collection complete!</p>
          <p>
            Recommendation:{" "}
            {gps.suspicionResult?.recommendation.toUpperCase()}
          </p>
          <p>Suspicion Score: {gps.suspicionResult?.score}</p>
        </div>
      )}

      {gps.error && (
        <div style={{ color: "red" }}>
          <p>⚠️ {gps.error}</p>
        </div>
      )}

      <div style={{ marginTop: "20px" }}>
        <button onClick={gps.start} disabled={gps.isCollecting}>
          Start GPS Collection
        </button>
        <button onClick={gps.reset} style={{ marginLeft: "10px" }}>
          Reset
        </button>
      </div>
    </div>
  );
}

/**
 * Example 2: Attendance Scan Form with GPS Collection
 * Full workflow: collect GPS -> verify -> submit attendance
 */
export function AttendanceScanForm() {
  const [scanAction, setScanAction] = useState<"checkin" | "checkout" | null>(
    null
  );
  const [submitting, setSubmitting] = useState(false);

  const gps = useGPSCollection({
    readingsCount: 5,
    readingInterval: 3000,
    onComplete: (state) => {
      console.log("GPS ready for scan:", state.suspicionResult?.recommendation);
    },
  });

  const handleScanClick = (action: "checkin" | "checkout") => {
    setScanAction(action);
    if (!gps.isCollecting && !gps.isReady) {
      gps.start();
    }
  };

  const handleSubmit = async () => {
    if (!gps.isReady || !scanAction) return;

    setSubmitting(true);

    try {
      const response = await fetch("/api/attendance/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: scanAction,
          gps_positions: gps.positions,
          suspected_spoofing_score: gps.suspicionResult?.score,
          suspected_spoofing_flags: gps.suspicionResult?.flags.map(
            (f) => f.indicator
          ),
          device_id: getDeviceId(),
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        alert(`Scan failed: ${error.error}`);
      } else {
        alert(
          `${scanAction === "checkin" ? "Checked in" : "Checked out"} successfully!`
        );
        gps.reset();
        setScanAction(null);
      }
    } catch (error) {
      alert(`Error: ${error instanceof Error ? error.message : "Unknown error"}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: "20px", maxWidth: "500px" }}>
      <h2>Attendance Scanner</h2>

      {/* Progress Section */}
      {gps.isCollecting && (
        <div
          style={{
            padding: "15px",
            backgroundColor: "#e3f2fd",
            borderRadius: "8px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "10px",
            }}
          >
            <span>
              <strong>Preparing Scan...</strong>
            </span>
            <span>{gps.progress}/5 readings</span>
          </div>
          <progress
            value={gps.progress}
            max={5}
            style={{ width: "100%", height: "8px" }}
          />
          <div
            style={{
              marginTop: "10px",
              fontSize: "12px",
              color: "#666",
            }}
          >
            {Math.ceil(gps.estimatedRemainingTime / 1000)}s remaining
          </div>
        </div>
      )}

      {/* Ready Section */}
      {gps.isReady && (
        <div
          style={{
            padding: "15px",
            backgroundColor: "#e8f5e9",
            borderRadius: "8px",
            marginBottom: "20px",
          }}
        >
          <p>
            ✓ <strong>Ready to scan</strong> (GPS verified)
          </p>
          {gps.suspicionResult?.recommendation !== "pass" && (
            <p style={{ fontSize: "12px", color: "#ff6f00" }}>
              ⚠️ Warning: GPS appears unusual
            </p>
          )}
        </div>
      )}

      {/* Error Section */}
      {gps.error && (
        <div
          style={{
            padding: "15px",
            backgroundColor: "#ffebee",
            borderRadius: "8px",
            marginBottom: "20px",
            color: "#d32f2f",
          }}
        >
          <p>{gps.error}</p>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
        <button
          onClick={() => handleScanClick("checkin")}
          disabled={gps.isCollecting || submitting}
          style={getButtonStyle(gps.isCollecting || submitting)}
        >
          {gps.isCollecting && scanAction === "checkin" ? "Preparing..." : "Check In"}
        </button>

        <button
          onClick={() => handleScanClick("checkout")}
          disabled={gps.isCollecting || submitting}
          style={getButtonStyle(gps.isCollecting || submitting)}
        >
          {gps.isCollecting && scanAction === "checkout"
            ? "Preparing..."
            : "Check Out"}
        </button>
      </div>

      {/* Submit Button */}
      {gps.isReady && scanAction && (
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{
            width: "100%",
            marginTop: "10px",
            padding: "12px",
            backgroundColor: "#4CAF50",
            color: "white",
            border: "none",
            borderRadius: "4px",
            cursor: submitting ? "not-allowed" : "pointer",
            fontSize: "16px",
          }}
        >
          {submitting ? "Submitting..." : `Confirm ${scanAction.toUpperCase()}`}
        </button>
      )}

      {/* Reset button */}
      {(gps.isReady || gps.error) && (
        <button
          onClick={gps.reset}
          style={{
            width: "100%",
            marginTop: "10px",
            padding: "10px",
            backgroundColor: "#f5f5f5",
            border: "1px solid #ddd",
            borderRadius: "4px",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          Reset
        </button>
      )}
    </div>
  );
}

/**
 * Example 3: GPS Status Widget
 * Minimal UI showing just the GPS status and progress
 */
export function GPSStatusWidget() {
  const gps = useGPSCollection();

  const getStatusMessage = () => {
    if (gps.isCollecting) {
      return `Collecting GPS... ${gps.progress}/${5} (${Math.ceil(
        gps.estimatedRemainingTime / 1000
      )}s)`;
    }
    if (gps.isReady) {
      return `✓ GPS Ready (Score: ${gps.suspicionResult?.score})`;
    }
    if (gps.error) {
      return `✗ GPS Error: ${gps.error}`;
    }
    return "Not started";
  };

  return (
    <div
      style={{
        padding: "10px",
        fontSize: "12px",
        backgroundColor: gps.isReady ? "#e8f5e9" : "#f5f5f5",
        borderLeft: `4px solid ${getTitleColorByStatus(gps)}`,
      }}
    >
      {getStatusMessage()}
      {gps.isCollecting && (
        <div style={{ marginTop: "5px" }}>
          <progress
            value={gps.progress}
            max={5}
            style={{ width: "100%", height: "4px" }}
          />
        </div>
      )}
    </div>
  );
}

/**
 * Example 4: Advanced GPS Monitor
 * Detailed view with all GPS readings and analysis
 */
export function GPSMonitorAdvanced() {
  const gps = useGPSCollection({
    readingsCount: 5,
    readingInterval: 3000,
  });

  return (
    <div style={{ padding: "20px", fontFamily: "monospace", fontSize: "12px" }}>
      <h3>GPS Monitor (DEBUG)</h3>

      <div style={{ marginBottom: "15px" }}>
        <strong>Collection Status:</strong>
        <ul>
          <li>Ready: {gps.isReady ? "YES" : "NO"}</li>
          <li>Collecting: {gps.isCollecting ? "YES" : "NO"}</li>
          <li>Progress: {gps.progress}/5</li>
          <li>
            Estimated Remaining: {Math.ceil(gps.estimatedRemainingTime / 1000)}s
          </li>
        </ul>
      </div>

      <div style={{ marginBottom: "15px" }}>
        <strong>Positions ({gps.positions.length}):</strong>
        <pre
          style={{
            backgroundColor: "#f5f5f5",
            padding: "10px",
            overflowX: "auto",
            maxHeight: "200px",
          }}
        >
          {JSON.stringify(gps.positions, null, 2)}
        </pre>
      </div>

      {gps.suspicionResult && (
        <div style={{ marginBottom: "15px" }}>
          <strong>Suspicion Analysis:</strong>
          <pre
            style={{
              backgroundColor: "#f5f5f5",
              padding: "10px",
              overflowX: "auto",
              maxHeight: "200px",
            }}
          >
            {JSON.stringify(gps.suspicionResult, null, 2)}
          </pre>
        </div>
      )}

      {gps.error && (
        <div style={{ color: "red" }}>
          <strong>Error:</strong> {gps.error}
        </div>
      )}

      <div style={{ marginTop: "20px", gap: "10px", display: "flex" }}>
        <button onClick={gps.start} disabled={gps.isCollecting}>
          Start
        </button>
        <button onClick={gps.cancel} disabled={!gps.isCollecting}>
          Cancel
        </button>
        <button onClick={gps.reset}>Reset</button>
      </div>
    </div>
  );
}

// ============ Utility Functions ============

function getDeviceId(): string {
  const stored = localStorage.getItem("device_id");
  if (stored) return stored;

  const generated = `device_${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 9)}`;
  localStorage.setItem("device_id", generated);
  return generated;
}

function getButtonStyle(disabled: boolean) {
  return {
    padding: "12px",
    backgroundColor: disabled ? "#ccc" : "#2196F3",
    color: "white",
    border: "none",
    borderRadius: "4px",
    cursor: disabled ? "not-allowed" : "pointer",
    fontSize: "14px",
    opacity: disabled ? 0.6 : 1,
  };
}

function getTitleColorByStatus(
  gps: ReturnType<typeof useGPSCollection>
): string {
  if (gps.isReady) return "#4CAF50";
  if (gps.isCollecting) return "#2196F3";
  if (gps.error) return "#f44336";
  return "#9E9E9E";
}
