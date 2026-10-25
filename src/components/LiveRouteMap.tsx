import React, { useEffect } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  Popup,
  useMap,
  LayersControl,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { LatLng } from "../lib/routing";

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl:
    "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

interface LiveRouteMapProps {
  origin: LatLng;
  destination: LatLng;
  path: LatLng[];
  routeColor?: string;
  heightClassName?: string;
}

const FitBounds: React.FC<{ points: LatLng[] }> = ({ points }) => {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    const bounds = L.latLngBounds(
      points.map((p) => [p.lat, p.lng] as [number, number])
    );
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [points, map]);
  return null;
};

export const LiveRouteMap: React.FC<LiveRouteMapProps> = ({
  origin,
  destination,
  path,
  routeColor = "#A70F43",
  heightClassName = "h-[440px]",
}) => {
  const center: [number, number] = [
    (origin.lat + destination.lat) / 2,
    (origin.lng + destination.lng) / 2,
  ];
  
  const polylinePositions: [number, number][] = path.map((p) => [p.lat, p.lng]);

  return (
    <div
      className={`relative w-full ${heightClassName} rounded-[22px] overflow-hidden border border-[#EFE6E1]`}
    >
      <MapContainer
        center={center}
        zoom={15}
        scrollWheelZoom
        style={{ height: "100%", width: "100%" }}
      >
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
            <TileLayer
              attribution="&copy; OpenStreetMap contributors"
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              maxZoom={19}
            />
          </LayersControl.BaseLayer>
        </LayersControl>

        {polylinePositions.length > 1 && (
          <Polyline
            positions={polylinePositions}
            pathOptions={{ color: routeColor, weight: 5, opacity: 0.85 }}
          />
        )}
        <Marker position={[origin.lat, origin.lng]}>
          <Popup>Start</Popup>
        </Marker>
        <Marker position={[destination.lat, destination.lng]}>
          <Popup>Destination</Popup>
        </Marker>
        <FitBounds points={[origin, destination, ...path]} />
      </MapContainer>
    </div>
  );
};