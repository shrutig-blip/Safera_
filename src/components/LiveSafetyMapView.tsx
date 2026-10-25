import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, CircleMarker, Rectangle, Marker, Popup, Tooltip, useMap, LayersControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { SafetyLocation } from '../types';
import { riskBandColor, type SafetyGridCell, type BoundingBox } from '../utils/hotspot';

// react-leaflet's default marker icon points at file paths that don't
// survive bundling — same fix already used in LiveRouteMap.tsx, repeated
// here since this is a separate entry point that may mount before it.
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const youAreHereIcon = L.divIcon({
  className: '',
  html: `<div style="width:16px;height:16px;border-radius:9999px;background:#2563EB;border:3px solid white;box-shadow:0 0 0 3px rgba(37,99,235,0.35);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

interface LiveSafetyMapViewProps {
  locations: SafetyLocation[];
  safetyGrid: SafetyGridCell[];
  boundingBox: BoundingBox;
  userCoords: { lat: number; lng: number } | null;
  selectedLocationId: string;
  onSelectLocation: (loc: SafetyLocation) => void;
  showHeatmap: boolean;
  heightClassName?: string;
}

/** Refits the view whenever the underlying data's bounding box actually changes, without fighting the user's own pan/zoom on every re-render. */
const FitToBounds: React.FC<{ box: BoundingBox; userCoords: { lat: number; lng: number } | null }> = ({ box, userCoords }) => {
  const map = useMap();
  const boxKey = `${box.minLat.toFixed(4)},${box.maxLat.toFixed(4)},${box.minLng.toFixed(4)},${box.maxLng.toFixed(4)}`;

  useEffect(() => {
    const corners: [number, number][] = [
      [box.minLat, box.minLng],
      [box.maxLat, box.maxLng],
    ];
    if (userCoords) corners.push([userCoords.lat, userCoords.lng]);
    map.fitBounds(L.latLngBounds(corners), { padding: [30, 30] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boxKey, map]);

  return null;
};

export const LiveSafetyMapView: React.FC<LiveSafetyMapViewProps> = ({
  locations,
  safetyGrid,
  boundingBox,
  userCoords,
  selectedLocationId,
  onSelectLocation,
  showHeatmap,
  heightClassName = 'h-[440px]',
}) => {
  const center: [number, number] = userCoords
    ? [userCoords.lat, userCoords.lng]
    : [(boundingBox.minLat + boundingBox.maxLat) / 2, (boundingBox.minLng + boundingBox.maxLng) / 2];

  // The grid cells only carry xPct/yPct plus a row/col index — infer the
  // grid's actual row/col count from the data itself, then invert the same
  // percentage projection computeSafetyGrid used, so each cell can be drawn
  // as a real Rectangle at its true lat/lng bounds instead of a floating div.
  const cellRectangles = useMemo(() => {
    if (safetyGrid.length === 0) return [];
    const rows = Math.max(...safetyGrid.map((c) => c.row)) + 1;
    const cols = Math.max(...safetyGrid.map((c) => c.col)) + 1;
    const latSpan = boundingBox.maxLat - boundingBox.minLat;
    const lngSpan = boundingBox.maxLng - boundingBox.minLng;

    return safetyGrid.map((cell) => {
      const cellMaxLat = boundingBox.maxLat - (cell.row / rows) * latSpan;
      const cellMinLat = boundingBox.maxLat - ((cell.row + 1) / rows) * latSpan;
      const cellMinLng = boundingBox.minLng + (cell.col / cols) * lngSpan;
      const cellMaxLng = boundingBox.minLng + ((cell.col + 1) / cols) * lngSpan;
      return {
        cell,
        bounds: [
          [cellMinLat, cellMinLng],
          [cellMaxLat, cellMaxLng],
        ] as [[number, number], [number, number]],
      };
    });
  }, [safetyGrid, boundingBox]);

  return (
    <div className={`relative w-full ${heightClassName} rounded-[22px] overflow-hidden border border-[#EFE6E1]`}>
      <MapContainer center={center} zoom={15} scrollWheelZoom style={{ height: '100%', width: '100%' }}>
        <LayersControl position="topright">
          <LayersControl.BaseLayer checked name="Clean (Smooth Zoom)">
            <TileLayer
              attribution="&copy; OpenStreetMap contributors &copy; CARTO"
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              subdomains="abcd"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
          <LayersControl.BaseLayer name="Detailed (More Labels)">
            <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" maxZoom={19} />
          </LayersControl.BaseLayer>
        </LayersControl>

        {/* Real risk grid, drawn over real streets instead of an absolutely-positioned div overlay */}
        {showHeatmap &&
          cellRectangles.map(({ cell, bounds }) => (
            <Rectangle
              key={`${cell.row}-${cell.col}`}
              bounds={bounds}
              pathOptions={{
                color: 'transparent',
                fillColor: riskBandColor(cell.band),
                fillOpacity: 1,
                weight: 0,
              }}
            >
              <Tooltip sticky>
                Risk {cell.risk}/100 · {cell.contributingSignals} nearby signal(s)
              </Tooltip>
            </Rectangle>
          ))}

        {/* Real locations, positioned by actual lat/lng with a working popup */}
        {locations.map((loc) => {
          const isSelected = loc.id === selectedLocationId;
          const color = loc.safetyScore >= 70 ? '#5FA777' : loc.safetyScore >= 45 ? '#F2C94C' : '#A7194B';
          return (
            <CircleMarker
              key={loc.id}
              center={[loc.lat, loc.lng]}
              radius={isSelected ? 10 : 7}
              pathOptions={{
                color: '#FFFFFF',
                weight: 2,
                fillColor: color,
                fillOpacity: 1,
              }}
              eventHandlers={{ click: () => onSelectLocation(loc) }}
            >
              <Popup>
                <div style={{ fontWeight: 600 }}>{loc.name}</div>
                <div>Safety score: {loc.safetyScore}/100</div>
              </Popup>
            </CircleMarker>
          );
        })}

        {userCoords && (
          <Marker position={[userCoords.lat, userCoords.lng]} icon={youAreHereIcon}>
            <Popup>You are here</Popup>
          </Marker>
        )}

        <FitToBounds box={boundingBox} userCoords={userCoords} />
      </MapContainer>
    </div>
  );
};