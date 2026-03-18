"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_CENTER = [13.7563, 100.5018];
const DEFAULT_ZOOM = 14;
const CURRENT_LOCATION_ZOOM = 17;
const MAX_MAP_ZOOM = 22;
const MAX_NATIVE_TILE_ZOOM = 19;
const FREEHAND_MIN_POINT_DISTANCE_METERS = 3;

function buildProxyTileUrl(provider) {
  return `/api/map-tiles?provider=${provider}&z={z}&x={x}&y={y}`;
}

/**
 * Compare two center arrays [lat, lng] by value.
 * Returns true if both are equal or both are null/undefined.
 */
function centersEqual(a, b) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a[0] === b[0] && a[1] === b[1];
}

export default function LocationBoundaryMap({
  boundaryType,
  latitude,
  longitude,
  radiusMeters,
  boundaryJson,
  onCircleChange,
  onRectangleChange,
  onPolygonChange,
  onPolygonDraftChange,
  onCurrentLocationChange,
  clearSignal,
}) {
  const hasExplicitCircleCenter = Number.isFinite(latitude) && Number.isFinite(longitude);
  const isShapeDrawingMode = boundaryType === "rectangle" || boundaryType === "polygon";
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState("");
  const [mapNotice, setMapNotice] = useState("");
  const [currentLocation, setCurrentLocation] = useState(null);
  const [polygonDraftCount, setPolygonDraftCount] = useState(0);
  const [isPolygonDrawingActive, setIsPolygonDrawingActive] = useState(false);
  const [initialCenter, setInitialCenter] = useState(() => {
    if (hasExplicitCircleCenter) {
      return [latitude, longitude];
    }

    if (boundaryType === "rectangle" && boundaryJson) {
      return [
        (Number(boundaryJson.south) + Number(boundaryJson.north)) / 2,
        (Number(boundaryJson.west) + Number(boundaryJson.east)) / 2,
      ];
    }

    if (boundaryType === "polygon" && boundaryJson?.points?.length >= 3) {
      const latitudes = boundaryJson.points.map((point) => Number(point.lat));
      const longitudes = boundaryJson.points.map((point) => Number(point.lng));
      return [
        (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
        (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
      ];
    }

    return null;
  });
  const [initialCenterResolved, setInitialCenterResolved] = useState(() => Boolean(initialCenter));
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const drawBoundaryRef = useRef(null);
  const overlayLayerRef = useRef(null);
  const cornerMarkerLayerRef = useRef(null);
  const firstCornerRef = useRef(null);
  const polygonDraftRef = useRef([]);
  const polygonClickHandlerRef = useRef(null);
  const polygonMouseDownHandlerRef = useRef(null);
  const polygonMouseMoveHandlerRef = useRef(null);
  const polygonMouseUpHandlerRef = useRef(null);
  const polygonPointerDownRef = useRef(false);
  const polygonPointerMovedRef = useRef(false);
  const polygonPointerStartRef = useRef(null);
  const polygonSuppressClickRef = useRef(false);
  const tileLayersRef = useRef({ satellite: null, street: null, osm: null });
  const hasAutoCenteredRef = useRef(false);
  /** Track whether the map has been initialized at least once to avoid re-init */
  const mapInitializedOnceRef = useRef(false);
  const latestConfigRef = useRef({
    boundaryType,
    latitude,
    longitude,
    radiusMeters,
    boundaryJson,
    onCircleChange,
    onRectangleChange,
    onPolygonChange,
    onPolygonDraftChange,
    onCurrentLocationChange,
  });

  latestConfigRef.current = {
    boundaryType,
    latitude,
    longitude,
    radiusMeters,
    boundaryJson,
    onCircleChange,
    onRectangleChange,
    onPolygonChange,
    onPolygonDraftChange,
    onCurrentLocationChange,
  };

  const publishPolygonDraft = useCallback((points) => {
    setPolygonDraftCount(points.length);
    if (typeof latestConfigRef.current.onPolygonDraftChange === "function") {
      latestConfigRef.current.onPolygonDraftChange({ points });
    }
  }, []);

  const publishPolygonFinal = useCallback((points) => {
    if (typeof latestConfigRef.current.onPolygonChange === "function") {
      latestConfigRef.current.onPolygonChange({ points });
    }
  }, []);

  const publishCurrentLocation = useCallback((nextLocation) => {
    if (typeof latestConfigRef.current.onCurrentLocationChange === "function") {
      latestConfigRef.current.onCurrentLocationChange(nextLocation);
    }
  }, []);

  const disablePolygonDrawingMode = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (polygonClickHandlerRef.current) {
      map.off("click", polygonClickHandlerRef.current);
      polygonClickHandlerRef.current = null;
    }

    if (polygonMouseDownHandlerRef.current) {
      map.off("mousedown", polygonMouseDownHandlerRef.current);
      polygonMouseDownHandlerRef.current = null;
    }

    if (polygonMouseMoveHandlerRef.current) {
      map.off("mousemove", polygonMouseMoveHandlerRef.current);
      polygonMouseMoveHandlerRef.current = null;
    }

    if (polygonMouseUpHandlerRef.current) {
      map.off("mouseup", polygonMouseUpHandlerRef.current);
      map.off("mouseout", polygonMouseUpHandlerRef.current);
      polygonMouseUpHandlerRef.current = null;
    }

    polygonPointerDownRef.current = false;
    polygonPointerMovedRef.current = false;
    polygonPointerStartRef.current = null;
    polygonSuppressClickRef.current = false;

    map.dragging.enable();
    map.doubleClickZoom.enable();
  }, []);

  const enablePolygonDrawingMode = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;

    if (polygonClickHandlerRef.current) return;

    const appendPolygonPoint = (latlng, minimumDistanceMeters = 0) => {
      const config = latestConfigRef.current;
      if (config.boundaryType !== "polygon") return;

      if (config.boundaryJson?.points?.length >= 3 && polygonDraftRef.current.length === 0) {
        config.onPolygonDraftChange?.({ points: [] });
      }

      const nextPoint = {
        lat: Number(latlng.lat.toFixed(8)),
        lng: Number(latlng.lng.toFixed(8)),
      };
      const lastPoint = polygonDraftRef.current[polygonDraftRef.current.length - 1];

      if (lastPoint) {
        if (lastPoint.lat === nextPoint.lat && lastPoint.lng === nextPoint.lng) {
          return;
        }

        if (minimumDistanceMeters > 0) {
          const distance = map.distance([lastPoint.lat, lastPoint.lng], [nextPoint.lat, nextPoint.lng]);
          if (distance < minimumDistanceMeters) {
            return;
          }
        }
      }

      polygonDraftRef.current = [...polygonDraftRef.current, nextPoint];
      publishPolygonDraft(polygonDraftRef.current);
      drawBoundaryRef.current?.();
    };

    polygonMouseDownHandlerRef.current = (event) => {
      const config = latestConfigRef.current;
      if (config.boundaryType !== "polygon") return;

      polygonPointerDownRef.current = true;
      polygonPointerMovedRef.current = false;
      polygonPointerStartRef.current = event.latlng;
      polygonSuppressClickRef.current = false;
    };

    polygonMouseMoveHandlerRef.current = (event) => {
      const config = latestConfigRef.current;
      if (config.boundaryType !== "polygon") return;
      if (!polygonPointerDownRef.current) return;

      if (!polygonPointerMovedRef.current && polygonPointerStartRef.current) {
        appendPolygonPoint(polygonPointerStartRef.current, 0);
        polygonPointerMovedRef.current = true;
        polygonSuppressClickRef.current = true;
      }

      appendPolygonPoint(event.latlng, FREEHAND_MIN_POINT_DISTANCE_METERS);
    };

    polygonMouseUpHandlerRef.current = () => {
      polygonPointerDownRef.current = false;
      polygonPointerMovedRef.current = false;
      polygonPointerStartRef.current = null;
    };

    polygonClickHandlerRef.current = (event) => {
      if (polygonSuppressClickRef.current) {
        polygonSuppressClickRef.current = false;
        return;
      }

      appendPolygonPoint(event.latlng, 0);
    };

    map.on("mousedown", polygonMouseDownHandlerRef.current);
    map.on("mousemove", polygonMouseMoveHandlerRef.current);
    map.on("mouseup", polygonMouseUpHandlerRef.current);
    map.on("mouseout", polygonMouseUpHandlerRef.current);
    map.on("click", polygonClickHandlerRef.current);
  }, [publishPolygonDraft]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (boundaryType !== "polygon") return;

    if (isPolygonDrawingActive) {
      map.dragging.disable();
      map.doubleClickZoom.disable();
      return;
    }

    map.dragging.enable();
    map.doubleClickZoom.enable();
  }, [boundaryType, isPolygonDrawingActive]);

  const centerMapToPosition = useCallback((lat, lng, zoom = CURRENT_LOCATION_ZOOM) => {
    const map = mapRef.current;
    if (!map || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    map.setView([lat, lng], zoom);
  }, []);

  const locateCurrentArea = useCallback(() => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocationError("Browser does not support geolocation.");
      return;
    }

    setLocating(true);
    setLocationError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLat = Number(position.coords.latitude);
        const nextLng = Number(position.coords.longitude);
        const nextLocation = {
          latitude: nextLat,
          longitude: nextLng,
          accuracy: Number(position.coords.accuracy),
        };

        setCurrentLocation(nextLocation);
        publishCurrentLocation(nextLocation);
        setInitialCenter((prev) => {
          const next = [nextLat, nextLng];
          return centersEqual(prev, next) ? prev : next;
        });
        setInitialCenterResolved(true);
        centerMapToPosition(nextLat, nextLng);
        hasAutoCenteredRef.current = true;
        setLocating(false);
      },
      (error) => {
        setLocationError(`Location error: ${error.message}`);
        setLocating(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  }, [centerMapToPosition, publishCurrentLocation]);

  // --- FIX: stable initialCenter setter that compares by value ---
  useEffect(() => {
    let nextCenter = null;

    if (hasExplicitCircleCenter) {
      nextCenter = [latitude, longitude];
    } else if (boundaryType === "rectangle" && boundaryJson) {
      nextCenter = [
        (Number(boundaryJson.south) + Number(boundaryJson.north)) / 2,
        (Number(boundaryJson.west) + Number(boundaryJson.east)) / 2,
      ];
    } else if (boundaryType === "polygon" && boundaryJson?.points?.length >= 3) {
      const latitudes = boundaryJson.points.map((point) => Number(point.lat));
      const longitudes = boundaryJson.points.map((point) => Number(point.lng));
      nextCenter = [
        (Math.min(...latitudes) + Math.max(...latitudes)) / 2,
        (Math.min(...longitudes) + Math.max(...longitudes)) / 2,
      ];
    }

    setInitialCenter((prev) => {
      if (!nextCenter && !prev) return prev;
      if (centersEqual(prev, nextCenter)) return prev;
      return nextCenter;
    });
    setInitialCenterResolved((prev) => {
      const next = Boolean(nextCenter);
      return prev === next ? prev : next;
    });
  }, [boundaryJson, boundaryType, hasExplicitCircleCenter, latitude, longitude]);

  useEffect(() => {
    if (initialCenterResolved || hasAutoCenteredRef.current) return;
    locateCurrentArea();
  }, [initialCenterResolved, locateCurrentArea]);

  useEffect(() => {
    setIsPolygonDrawingActive(false);
  }, [boundaryType]);

  useEffect(() => {
    if (boundaryType !== "polygon") {
      disablePolygonDrawingMode();
      return;
    }

    if (isPolygonDrawingActive) {
      enablePolygonDrawingMode();
      return;
    }

    disablePolygonDrawingMode();
  }, [boundaryType, disablePolygonDrawingMode, enablePolygonDrawingMode, isPolygonDrawingActive]);

  useEffect(() => {
    const map = mapRef.current;
    const { satellite, street, osm } = tileLayersRef.current;
    if (!map || !street || !osm || !isShapeDrawingMode) return;

    if (satellite && map.hasLayer(satellite)) {
      map.removeLayer(satellite);
    }

    if (!map.hasLayer(street) && !map.hasLayer(osm)) {
      street.addTo(map);
    }
  }, [isShapeDrawingMode]);

  const drawCornerMarkers = useCallback(() => {
    const L = leafletRef.current;
    const markerLayer = cornerMarkerLayerRef.current;
    if (!L || !markerLayer) return;

    markerLayer.clearLayers();

    if (firstCornerRef.current) {
      L.circleMarker([firstCornerRef.current.lat, firstCornerRef.current.lng], {
        radius: 6,
        color: "#F59E0B",
        fillColor: "#F59E0B",
        fillOpacity: 0.9,
        weight: 2,
        interactive: false,
      }).addTo(markerLayer);
    }

    polygonDraftRef.current.forEach((point, index) => {
      L.circleMarker([point.lat, point.lng], {
        radius: 5,
        color: index === polygonDraftRef.current.length - 1 ? "#F59E0B" : "#DC2626",
        fillColor: index === polygonDraftRef.current.length - 1 ? "#F59E0B" : "#DC2626",
        weight: 2,
        interactive: false,
      }).addTo(markerLayer);
    });
  }, []);

  const drawBoundary = useCallback(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const overlayLayer = overlayLayerRef.current;
    if (!L || !map || !overlayLayer) return;

    overlayLayer.clearLayers();

    const drawCurrentLocationOverlay = () => {
      if (!currentLocation) return;

      L.circleMarker([currentLocation.latitude, currentLocation.longitude], {
        radius: 7,
        color: "#0F766E",
        fillColor: "#14B8A6",
        fillOpacity: 1,
        weight: 2,
        interactive: false,
      }).addTo(overlayLayer).bindTooltip("Current location", {
        direction: "top",
        offset: [0, -8],
      });

      if (!isShapeDrawingMode && Number.isFinite(currentLocation.accuracy) && currentLocation.accuracy > 0) {
        L.circle([currentLocation.latitude, currentLocation.longitude], {
          radius: currentLocation.accuracy,
          color: "#14B8A6",
          weight: 1,
          fillColor: "#14B8A6",
          fillOpacity: 0.08,
          interactive: false,
        }).addTo(overlayLayer);
      }
    };

    if (boundaryType === "rectangle" && boundaryJson) {
      const bounds = [
        [boundaryJson.south, boundaryJson.west],
        [boundaryJson.north, boundaryJson.east],
      ];

      L.rectangle(bounds, {
        color: "#DC2626",
        weight: 2,
        fillColor: "#DC2626",
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(overlayLayer);

      map.fitBounds(bounds, { padding: [24, 24] });
      drawCurrentLocationOverlay();
      drawCornerMarkers();
      return;
    }

    if (boundaryType === "polygon" && boundaryJson?.points?.length >= 3) {
      const latLngs = boundaryJson.points.map((point) => [point.lat, point.lng]);

      L.polygon(latLngs, {
        color: "#DC2626",
        weight: 2,
        fillColor: "#DC2626",
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(overlayLayer);

      map.fitBounds(L.latLngBounds(latLngs), { padding: [24, 24] });
      drawCurrentLocationOverlay();
      drawCornerMarkers();
      return;
    }

    if (boundaryType === "polygon" && polygonDraftRef.current.length >= 1) {
      const latLngs = polygonDraftRef.current.map((point) => [point.lat, point.lng]);

      if (latLngs.length >= 2) {
        L.polyline(latLngs, {
          color: "#F59E0B",
          weight: 2,
          dashArray: "8 6",
          interactive: false,
        }).addTo(overlayLayer);
      }

      drawCurrentLocationOverlay();
      drawCornerMarkers();
      return;
    }

    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      L.circle([latitude, longitude], {
        radius: Number(radiusMeters) || 200,
        color: "#DC2626",
        weight: 2,
        fillColor: "#DC2626",
        fillOpacity: 0.12,
        interactive: false,
      }).addTo(overlayLayer);

      L.circleMarker([latitude, longitude], {
        radius: 6,
        color: "#DC2626",
        fillColor: "#DC2626",
        fillOpacity: 1,
        weight: 2,
        interactive: false,
      }).addTo(overlayLayer);

      map.setView([latitude, longitude], Math.max(map.getZoom(), DEFAULT_ZOOM));
    }

    drawCurrentLocationOverlay();
    drawCornerMarkers();
  }, [boundaryJson, boundaryType, currentLocation, drawCornerMarkers, isShapeDrawingMode, latitude, longitude, radiusMeters]);

  useEffect(() => {
    drawBoundaryRef.current = drawBoundary;
  }, [drawBoundary]);

  const handleUndoPolygonPoint = useCallback(() => {
    if (polygonDraftRef.current.length === 0) return;

    polygonDraftRef.current = polygonDraftRef.current.slice(0, -1);
    publishPolygonDraft(polygonDraftRef.current);
    drawBoundary();
  }, [drawBoundary, publishPolygonDraft]);

  const handleFinishPolygon = useCallback(() => {
    if (polygonDraftRef.current.length < 3) return;
    publishPolygonFinal(polygonDraftRef.current);
    setIsPolygonDrawingActive(false);
    disablePolygonDrawingMode();
  }, [disablePolygonDrawingMode, publishPolygonFinal]);

  // --- FIX: Map init effect depends ONLY on initialCenter + initialCenterResolved ---
  // Other reactive values are read from refs so they don't trigger re-init.
  useEffect(() => {
    // Guard: only init once. After the first init, the map stays alive.
    // If the component unmounts, cleanup will run and reset the flag.
    if (mapRef.current) return;
    if (!initialCenterResolved || !initialCenter) return;
    if (!mapElementRef.current) return;

    let disposed = false;

    async function initMap() {
      const leafletModule = await import("leaflet");
      if (disposed || !mapElementRef.current || mapRef.current) return;

      const L = leafletModule.default || leafletModule;
      leafletRef.current = L;

      const map = L.map(mapElementRef.current, {
        center: initialCenter,
        zoom: DEFAULT_ZOOM,
        maxZoom: MAX_MAP_ZOOM,
      });

      const satellite = L.tileLayer(buildProxyTileUrl("satellite"), {
        attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community",
        maxZoom: MAX_MAP_ZOOM,
        maxNativeZoom: MAX_NATIVE_TILE_ZOOM,
      });
      const street = L.tileLayer(buildProxyTileUrl("street"), {
        attribution: "Tiles &copy; Esri, HERE, Garmin, Intermap, increment P Corp., GEBCO, USGS, FAO, NPS, NRCAN, GeoBase, IGN, Kadaster NL, Ordnance Survey, Esri Japan, METI, Esri China (Hong Kong), and the GIS User Community",
        maxZoom: MAX_MAP_ZOOM,
        maxNativeZoom: MAX_NATIVE_TILE_ZOOM,
      });
      const osm = L.tileLayer(buildProxyTileUrl("osm"), {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: MAX_MAP_ZOOM,
        maxNativeZoom: MAX_NATIVE_TILE_ZOOM,
      });

      street.addTo(map);
      tileLayersRef.current = { satellite, street, osm };

      const ensureLayerActive = (preferredLayer, fallbackLayer) => {
        if (map.hasLayer(preferredLayer)) {
          map.removeLayer(preferredLayer);
        }

        if (fallbackLayer && !map.hasLayer(fallbackLayer)) {
          fallbackLayer.addTo(map);
        }
      };

      satellite.on("tileerror", () => {
        setMapNotice("Satellite imagery is not available for this area right now, so the map switched to Street Map.");
        ensureLayerActive(satellite, street);
      });

      street.on("tileerror", () => {
        setMapNotice("Street map tiles are not available from the primary provider, so the map switched to OpenStreetMap.");
        ensureLayerActive(street, osm);
      });

      street.on("add", () => { setMapNotice(""); });
      satellite.on("add", () => { setMapNotice(""); });
      osm.on("add", () => { setMapNotice(""); });

      L.control.layers(
        {
          "Satellite": satellite,
          "Street Map": street,
          "OpenStreetMap": osm,
        },
        {},
        { position: "topright" }
      ).addTo(map);

      overlayLayerRef.current = L.layerGroup().addTo(map);
      cornerMarkerLayerRef.current = L.layerGroup().addTo(map);

      map.on("click", (event) => {
        const config = latestConfigRef.current;
        if (config.boundaryType === "polygon") return;

        const clickedLat = Number(event.latlng.lat.toFixed(8));
        const clickedLng = Number(event.latlng.lng.toFixed(8));

        if (config.boundaryType === "rectangle") {
          if (!firstCornerRef.current) {
            firstCornerRef.current = { lat: clickedLat, lng: clickedLng };
            drawBoundaryRef.current?.();
            return;
          }

          const first = firstCornerRef.current;
          firstCornerRef.current = null;
          config.onRectangleChange({
            south: Math.min(first.lat, clickedLat),
            west: Math.min(first.lng, clickedLng),
            north: Math.max(first.lat, clickedLat),
            east: Math.max(first.lng, clickedLng),
          });
          return;
        }

        config.onCircleChange({
          latitude: clickedLat,
          longitude: clickedLng,
        });
      });

      mapRef.current = map;
      mapInitializedOnceRef.current = true;

      // Re-enable polygon drawing mode if it was active before map was ready
      const config = latestConfigRef.current;
      if (config.boundaryType === "polygon") {
        // Check via the ref pattern since isPolygonDrawingActive is not in deps
        // We rely on the separate useEffect to handle polygon mode toggling
      }

      drawBoundaryRef.current?.();
    }

    initMap();

    return () => {
      disposed = true;
      if (mapRef.current) {
        mapRef.current.remove();
      }
      mapRef.current = null;
      leafletRef.current = null;
      overlayLayerRef.current = null;
      cornerMarkerLayerRef.current = null;
      firstCornerRef.current = null;
      polygonClickHandlerRef.current = null;
      polygonMouseDownHandlerRef.current = null;
      polygonMouseMoveHandlerRef.current = null;
      polygonMouseUpHandlerRef.current = null;
      polygonPointerDownRef.current = false;
      polygonPointerMovedRef.current = false;
      polygonPointerStartRef.current = null;
      polygonSuppressClickRef.current = false;
      polygonDraftRef.current = [];
      tileLayersRef.current = { satellite: null, street: null, osm: null };
      mapInitializedOnceRef.current = false;
      hasAutoCenteredRef.current = false;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCenter, initialCenterResolved]);

  useEffect(() => {
    drawBoundary();
  }, [drawBoundary]);

  useEffect(() => {
    firstCornerRef.current = null;
    polygonDraftRef.current = [];
    publishPolygonDraft([]);
    setPolygonDraftCount(0);
    setIsPolygonDrawingActive(false);
    drawBoundary();
  }, [boundaryType, clearSignal, drawBoundary, publishPolygonDraft]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-[#555555]">
        <span>
          {boundaryType === "rectangle"
            ? "Rectangle mode: click 2 points on the map to create opposite corners."
            : boundaryType === "polygon"
              ? "Polygon mode: click points or drag to free-draw around the area, undo if needed, then press Finish polygon."
              : "Circle mode: click once on the map to set the center point."}
        </span>
        {boundaryType === "polygon" ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-lg border border-[#FECACA] bg-white px-2 py-1 text-xs text-[#444444] transition hover:bg-[#FEF2F2] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={locateCurrentArea}
              disabled={locating}
            >
              {locating ? "Locating..." : "Current area"}
            </button>
            <button
              type="button"
              className="rounded-lg border border-[#FECACA] bg-white px-2 py-1 text-xs text-[#444444] transition hover:bg-[#FEF2F2] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleUndoPolygonPoint}
              disabled={polygonDraftCount === 0}
            >
              Undo last point
            </button>
            <button
              type="button"
              className="rounded-lg border border-[#DC2626] bg-white px-2 py-1 text-xs font-semibold text-[#F87171] transition hover:bg-[#FEF2F2] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => setIsPolygonDrawingActive(true)}
              disabled={isPolygonDrawingActive}
            >
              Start drawing
            </button>
            <button
              type="button"
              className="rounded-lg bg-[#DC2626] px-2 py-1 text-xs font-semibold text-white shadow-[0_10px_20px_rgba(220,38,38,0.22)] transition hover:bg-[#991B1B] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleFinishPolygon}
              disabled={polygonDraftCount < 3}
            >
              Finish polygon
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="rounded-lg border border-[#FECACA] bg-white px-2 py-1 text-xs text-[#444444] transition hover:bg-[#FEF2F2] disabled:cursor-not-allowed disabled:opacity-50"
            onClick={locateCurrentArea}
            disabled={locating}
          >
            {locating ? "Locating..." : "Current area"}
          </button>
        )}
      </div>
      {locationError ? <p className="text-xs text-[#FCA5A5]">{locationError}</p> : null}
      {mapNotice ? <p className="text-xs text-[#FCD34D]">{mapNotice}</p> : null}
      {!initialCenterResolved ? (
        <div className="flex h-[360px] items-center justify-center rounded-[1rem] border border-[#FECACA] bg-white text-sm text-[#555555] shadow-[0_12px_28px_rgba(0,0,0,0.24)]">
          Determining current area...
        </div>
      ) : (
        <div ref={mapElementRef} className="h-[360px] overflow-hidden rounded-[1rem] border border-[#FECACA] shadow-[0_12px_28px_rgba(0,0,0,0.24)]" />
      )}
    </div>
  );
}