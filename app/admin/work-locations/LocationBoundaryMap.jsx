"use client";

import { useCallback, useEffect, useRef } from "react";

const DEFAULT_CENTER = [17.9757, 102.6331];
const DEFAULT_ZOOM = 14;
const LEAFLET_CSS_ID = "tdone-leaflet-css";
const LEAFLET_CSS_HREF = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

function ensureLeafletStylesheet() {
  if (document.getElementById(LEAFLET_CSS_ID)) return;

  const link = document.createElement("link");
  link.id = LEAFLET_CSS_ID;
  link.rel = "stylesheet";
  link.href = LEAFLET_CSS_HREF;
  document.head.appendChild(link);
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
  clearSignal,
}) {
  const mapElementRef = useRef(null);
  const mapRef = useRef(null);
  const leafletRef = useRef(null);
  const overlayLayerRef = useRef(null);
  const cornerMarkerLayerRef = useRef(null);
  const firstCornerRef = useRef(null);
  const polygonDraftRef = useRef([]);
  const tileLayersRef = useRef({ satellite: null, street: null });
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
  };

  const publishPolygonDraft = useCallback((points) => {
    if (typeof latestConfigRef.current.onPolygonDraftChange === "function") {
      latestConfigRef.current.onPolygonDraftChange({ points });
    }
  }, []);

  const publishPolygonFinal = useCallback((points) => {
    if (typeof latestConfigRef.current.onPolygonChange === "function") {
      latestConfigRef.current.onPolygonChange({ points });
    }
  }, []);

  const handleUndoPolygonPoint = useCallback(() => {
    if (polygonDraftRef.current.length === 0) return;

    polygonDraftRef.current = polygonDraftRef.current.slice(0, -1);
    publishPolygonDraft(polygonDraftRef.current);
    drawBoundary();
  }, [drawBoundary, publishPolygonDraft]);

  const handleFinishPolygon = useCallback(() => {
    if (polygonDraftRef.current.length < 3) return;
    publishPolygonFinal(polygonDraftRef.current);
  }, [publishPolygonFinal]);

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
      }).addTo(markerLayer);
    }

    polygonDraftRef.current.forEach((point, index) => {
      L.circleMarker([point.lat, point.lng], {
        radius: 5,
        color: index === polygonDraftRef.current.length - 1 ? "#D946EF" : "#1352A3",
        fillColor: index === polygonDraftRef.current.length - 1 ? "#D946EF" : "#1352A3",
        fillOpacity: 0.95,
        weight: 2,
      }).addTo(markerLayer);
    });
  }, []);

  const drawBoundary = useCallback(() => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const overlayLayer = overlayLayerRef.current;
    if (!L || !map || !overlayLayer) return;

    overlayLayer.clearLayers();

    if (boundaryType === "rectangle" && boundaryJson) {
      const bounds = [
        [boundaryJson.south, boundaryJson.west],
        [boundaryJson.north, boundaryJson.east],
      ];

      L.rectangle(bounds, {
        color: "#1352A3",
        weight: 2,
        fillColor: "#1352A3",
        fillOpacity: 0.12,
      }).addTo(overlayLayer);

      map.fitBounds(bounds, { padding: [24, 24] });
      drawCornerMarkers();
      return;
    }

    if (boundaryType === "polygon" && boundaryJson?.points?.length >= 3) {
      const latLngs = boundaryJson.points.map((point) => [point.lat, point.lng]);

      L.polygon(latLngs, {
        color: "#1352A3",
        weight: 2,
        fillColor: "#1352A3",
        fillOpacity: 0.12,
      }).addTo(overlayLayer);

      map.fitBounds(L.latLngBounds(latLngs), { padding: [24, 24] });
      drawCornerMarkers();
      return;
    }

    if (boundaryType === "polygon" && polygonDraftRef.current.length >= 1) {
      const latLngs = polygonDraftRef.current.map((point) => [point.lat, point.lng]);

      if (latLngs.length >= 2) {
        L.polyline(latLngs, {
          color: "#D946EF",
          weight: 2,
          dashArray: "8 6",
        }).addTo(overlayLayer);
      }

      drawCornerMarkers();
      return;
    }

    if (Number.isFinite(latitude) && Number.isFinite(longitude)) {
      L.circle([latitude, longitude], {
        radius: Number(radiusMeters) || 200,
        color: "#1352A3",
        weight: 2,
        fillColor: "#1352A3",
        fillOpacity: 0.12,
      }).addTo(overlayLayer);

      L.circleMarker([latitude, longitude], {
        radius: 6,
        color: "#1352A3",
        fillColor: "#1352A3",
        fillOpacity: 1,
        weight: 2,
      }).addTo(overlayLayer);

      map.setView([latitude, longitude], Math.max(map.getZoom(), DEFAULT_ZOOM));
    }

    drawCornerMarkers();
  }, [boundaryJson, boundaryType, drawCornerMarkers, latitude, longitude, radiusMeters]);

  useEffect(() => {
    let disposed = false;

    async function initMap() {
      ensureLeafletStylesheet();
      const leafletModule = await import("leaflet");
      if (disposed || !mapElementRef.current || mapRef.current) return;

      const L = leafletModule.default || leafletModule;
      leafletRef.current = L;

      const map = L.map(mapElementRef.current, {
        center: DEFAULT_CENTER,
        zoom: DEFAULT_ZOOM,
      });

      const satellite = L.tileLayer("https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}", {
        attribution: "Tiles &copy; Esri, Maxar, Earthstar Geographics, and the GIS User Community",
      });
      const street = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap contributors',
      });

      satellite.addTo(map);
      tileLayersRef.current = { satellite, street };

      L.control.layers(
        {
          "Satellite": satellite,
          "Street Map": street,
        },
        {},
        { position: "topright" }
      ).addTo(map);

      overlayLayerRef.current = L.layerGroup().addTo(map);
      cornerMarkerLayerRef.current = L.layerGroup().addTo(map);

      map.on("click", (event) => {
        const config = latestConfigRef.current;
        const clickedLat = Number(event.latlng.lat.toFixed(8));
        const clickedLng = Number(event.latlng.lng.toFixed(8));

        if (config.boundaryType === "rectangle") {
          if (!firstCornerRef.current) {
            firstCornerRef.current = { lat: clickedLat, lng: clickedLng };
            drawCornerMarkers();
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

        if (config.boundaryType === "polygon") {
          if (config.boundaryJson?.points?.length >= 3 && polygonDraftRef.current.length === 0) {
            config.onPolygonDraftChange?.({ points: [] });
          }

          polygonDraftRef.current = [...polygonDraftRef.current, { lat: clickedLat, lng: clickedLng }];
          publishPolygonDraft(polygonDraftRef.current);
          drawBoundary();
          return;
        }

        config.onCircleChange({
          latitude: clickedLat,
          longitude: clickedLng,
        });
      });

      mapRef.current = map;
      drawBoundary();
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
      polygonDraftRef.current = [];
      publishPolygonDraft([]);
      tileLayersRef.current = { satellite: null, street: null };
    };
  }, [drawBoundary, drawCornerMarkers, publishPolygonDraft]);

  useEffect(() => {
    drawBoundary();
  }, [drawBoundary]);

  useEffect(() => {
    firstCornerRef.current = null;
    polygonDraftRef.current = [];
    publishPolygonDraft([]);
    drawCornerMarkers();
  }, [clearSignal, drawCornerMarkers, publishPolygonDraft]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-[#6B7A99]">
        <span>
          {boundaryType === "rectangle"
            ? "Rectangle mode: click 2 points on the map to create opposite corners."
            : boundaryType === "polygon"
              ? "Polygon mode: click multiple points around the area, undo if needed, then press Finish polygon."
              : "Circle mode: click once on the map to set the center point."}
        </span>
        {boundaryType === "polygon" ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-[#D0D8E4] bg-white px-2 py-1 text-xs text-[#334260] disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleUndoPolygonPoint}
              disabled={polygonDraftRef.current.length === 0}
            >
              Undo last point
            </button>
            <button
              type="button"
              className="rounded bg-[#1352A3] px-2 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleFinishPolygon}
              disabled={polygonDraftRef.current.length < 3}
            >
              Finish polygon
            </button>
          </div>
        ) : null}
      </div>
      <div ref={mapElementRef} className="h-[360px] rounded-xl border border-[#D0D8E4] overflow-hidden" />
    </div>
  );
}
