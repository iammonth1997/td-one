/**
 * GPS Pre-Scan Data Collection Hook
 * Collects multiple GPS readings before attendance scan to detect spoofing
 */

import { useEffect, useRef, useState } from "react";
import { calculateSuspicionScore, type GPSReading, type GPSSpoofingDetectionResult } from "@/lib/gpsSpoofingDetection";

/**
 * GPS collection progress and state
 */
export interface GPSCollectionState {
  /** Whether collection is complete and ready for scan */
  isReady: boolean;
  /** Suspicion detection result (null until ready) */
  suspicionResult: GPSSpoofingDetectionResult | null;
  /** Collected GPS positions */
  positions: GPSReading[];
  /** Current progress (0-5) */
  progress: number;
  /** Error message if collection failed */
  error: string | null;
  /** Whether currently collecting GPS data */
  isCollecting: boolean;
}

/**
 * GPS Collection Hook Configuration
 */
export interface GPSCollectionConfig {
  /** Number of GPS readings to collect (default: 5) */
  readingsCount?: number;
  /** Interval between readings in ms (default: 3000) */
  readingInterval?: number;
  /** Total collection time in ms (default: 15000) */
  totalDuration?: number;
  /** Enable auto-start on mount (default: false) */
  autoStart?: boolean;
  /** Callback when collection completes */
  onComplete?: (state: GPSCollectionState) => void;
  /** Callback when error occurs */
  onError?: (error: string) => void;
  /** Callback when progress changes */
  onProgress?: (progress: number) => void;
}

/**
 * Custom hook for GPS data collection with spoofing detection
 *
 * @param config Configuration options
 * @returns State and control methods for GPS collection
 *
 * @example
 * const gps = useGPSCollection({ readingsCount: 5, readingInterval: 3000 });
 *
 * return (
 *   <>
 *     <div>Progress: {gps.progress}/5</div>
 *     <button onClick={gps.start} disabled={gps.isCollecting}>
 *       Prepare Scan
 *     </button>
 *     <button onClick={gps.scan} disabled={!gps.isReady}>
 *       Check In
 *     </button>
 *   </>
 * );
 */
export function useGPSCollection(config: GPSCollectionConfig = {}) {
  const {
    readingsCount = 5,
    readingInterval = 3000,
    totalDuration = 15000,
    autoStart = false,
    onComplete,
    onError,
    onProgress,
  } = config;

  // State
  const [state, setState] = useState<GPSCollectionState>({
    isReady: false,
    suspicionResult: null,
    positions: [],
    progress: 0,
    error: null,
    isCollecting: false,
  });

  // Refs for cleanup and tracking
  const collectionRef = useRef<{
    intervalId: NodeJS.Timeout | null;
    positionsCollected: GPSReading[];
    startTime: number;
    isCancelled: boolean;
  }>({
    intervalId: null,
    positionsCollected: [],
    startTime: 0,
    isCancelled: false,
  });

  /**
   * Collect a single GPS reading
   */
  const collectSingleReading = async (): Promise<GPSReading | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        setState((prev) => ({ ...prev, error: "Geolocation not supported" }));
        resolve(null);
        return;
      }

      // Timeout after 5 seconds if location not available
      const timeoutId = setTimeout(() => {
        resolve(null);
      }, 5000);

      navigator.geolocation.getCurrentPosition(
        (position) => {
          clearTimeout(timeoutId);

          const reading: GPSReading = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            speed: position.coords.speed,
            timestamp: position.timestamp,
          };

          resolve(reading);
        },
        (error) => {
          clearTimeout(timeoutId);
          console.warn("Geolocation error:", error);
          resolve(null);
        },
        {
          enableHighAccuracy: true,
          timeout: 5000,
          maximumAge: 0,
        }
      );
    });
  };

  /**
   * Start GPS collection
   */
  const startCollection = async () => {
    // Reset state
    collectionRef.current.isCancelled = false;
    collectionRef.current.positionsCollected = [];
    collectionRef.current.startTime = Date.now();

    setState({
      isReady: false,
      suspicionResult: null,
      positions: [],
      progress: 0,
      error: null,
      isCollecting: true,
    });

    // Collect first reading immediately
    const firstReading = await collectSingleReading();

    if (collectionRef.current.isCancelled) return;

    if (firstReading) {
      collectionRef.current.positionsCollected.push(firstReading);

      setState((prev) => ({
        ...prev,
        positions: [...collectionRef.current.positionsCollected],
        progress: 1,
        error: null,
      }));

      onProgress?.(1);
    } else {
      setState((prev) => ({
        ...prev,
        error: "Failed to get initial GPS reading",
        isCollecting: false,
      }));
      onError?.("Failed to get initial GPS reading");
      return;
    }

    // Collect remaining readings at intervals
    let readingCount = 1;

    collectionRef.current.intervalId = setInterval(async () => {
      if (collectionRef.current.isCancelled) {
        if (collectionRef.current.intervalId) {
          clearInterval(collectionRef.current.intervalId);
          collectionRef.current.intervalId = null;
        }
        return;
      }

      readingCount++;

      if (readingCount > readingsCount) {
        // Collection complete
        if (collectionRef.current.intervalId) {
          clearInterval(collectionRef.current.intervalId);
          collectionRef.current.intervalId = null;
        }

        // Calculate suspicion score
        const suspicionResult = calculateSuspicionScore(
          collectionRef.current.positionsCollected
        );

        const finalState: GPSCollectionState = {
          isReady: true,
          suspicionResult,
          positions: collectionRef.current.positionsCollected,
          progress: readingsCount - 1,
          error: null,
          isCollecting: false,
        };

        setState(finalState);
        onComplete?.(finalState);
        return;
      }

      // Collect next reading
      const reading = await collectSingleReading();

      if (collectionRef.current.isCancelled) return;

      if (reading) {
        collectionRef.current.positionsCollected.push(reading);

        setState((prev) => ({
          ...prev,
          positions: [...collectionRef.current.positionsCollected],
          progress: readingCount,
          error: null,
        }));

        onProgress?.(readingCount);
      } else {
        // Use last known position if new reading fails
        console.warn(`Failed to get GPS reading ${readingCount}`);
        if (collectionRef.current.positionsCollected.length > 0) {
          const lastPosition = collectionRef.current.positionsCollected[
            collectionRef.current.positionsCollected.length - 1
          ];
          const fallbackReading: GPSReading = {
            ...lastPosition,
            timestamp: Date.now(),
          };
          collectionRef.current.positionsCollected.push(fallbackReading);

          setState((prev) => ({
            ...prev,
            positions: [...collectionRef.current.positionsCollected],
            progress: readingCount,
          }));

          onProgress?.(readingCount);
        }
      }
    }, readingInterval);

    // Safety timeout to complete collection after total duration
    const totalTimeoutId = setTimeout(() => {
      if (collectionRef.current.intervalId) {
        clearInterval(collectionRef.current.intervalId);
        collectionRef.current.intervalId = null;
      }

      if (collectionRef.current.positionsCollected.length >= 2) {
        // Calculate with whatever we have
        const suspicionResult = calculateSuspicionScore(
          collectionRef.current.positionsCollected
        );

        const finalState: GPSCollectionState = {
          isReady: true,
          suspicionResult,
          positions: collectionRef.current.positionsCollected,
          progress: collectionRef.current.positionsCollected.length,
          error: "Timed out collecting all readings, using partial data",
          isCollecting: false,
        };

        setState(finalState);
        onComplete?.(finalState);
      } else {
        setState((prev) => ({
          ...prev,
          error:
            "Failed to collect enough GPS data. Ensure location permission is enabled.",
          isCollecting: false,
        }));

        onError?.(
          "Failed to collect enough GPS data. Ensure location permission is enabled."
        );
      }
    }, totalDuration + 5000); // Add 5s buffer

    collectionRef.current.positionsCollected = collectionRef.current.positionsCollected;

    return () => clearTimeout(totalTimeoutId);
  };

  /**
   * Cancel GPS collection
   */
  const cancel = () => {
    collectionRef.current.isCancelled = true;

    if (collectionRef.current.intervalId) {
      clearInterval(collectionRef.current.intervalId);
      collectionRef.current.intervalId = null;
    }

    setState((prev) => ({
      ...prev,
      isCollecting: false,
      error: "Collection cancelled",
    }));
  };

  /**
   * Reset collection state
   */
  const reset = () => {
    cancel();

    setState({
      isReady: false,
      suspicionResult: null,
      positions: [],
      progress: 0,
      error: null,
      isCollecting: false,
    });

    collectionRef.current.positionsCollected = [];
  };

  /**
   * Auto-start on mount if configured
   */
  useEffect(() => {
    if (autoStart) {
      startCollection();
    }

    // Cleanup on unmount
    return () => {
      cancel();
    };
  }, [autoStart]);

  return {
    // State
    ...state,

    // Controls
    start: startCollection,
    cancel,
    reset,

    // Computed values
    estimatedRemainingTime: Math.max(
      0,
      totalDuration - (Date.now() - collectionRef.current.startTime)
    ),

    progressPercentage: (state.progress / readingsCount) * 100,
  };
}
