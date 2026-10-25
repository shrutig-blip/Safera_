import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, AlertTriangle, RadioTower } from 'lucide-react';
import { GuardIaLogo } from './GuardIaLogo';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// A Google-Maps-style "person" marker: a pulsing halo behind a solid dot with a
// person glyph, so it's obvious the pin represents a live person, not a place.
const personIcon = L.divIcon({
  className: 'safera-person-marker',
  html: `
    <div style="position:relative;width:40px;height:40px;display:flex;align-items:center;justify-content:center;">
      <span style="position:absolute;width:40px;height:40px;border-radius:9999px;background:rgba(138,30,65,0.25);animation:safera-pulse 1.8s ease-out infinite;"></span>
      <span style="position:relative;width:26px;height:26px;border-radius:9999px;background:#8A1E41;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="7" r="4"></circle>
          <path d="M5.5 21a7.5 7.5 0 0 1 13 0"></path>
        </svg>
      </span>
    </div>
    <style>
      @keyframes safera-pulse {
        0% { transform: scale(0.6); opacity: 0.9; }
        100% { transform: scale(1.8); opacity: 0; }
      }
    </style>
  `,
  iconSize: [40, 40],
  iconAnchor: [20, 20],
  popupAnchor: [0, -18],
});

interface LiveSession {
  id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  label: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

const POLL_INTERVAL_MS = 5000;

const Recenter: React.FC<{ lat: number; lng: number }> = ({ lat, lng }) => {
  const map = useMap();
  useEffect(() => {
    map.setView([lat, lng], map.getZoom() < 14 ? 16 : map.getZoom());
  }, [lat, lng, map]);
  return null;
};

// react-leaflet can sometimes leave dragging/touch handlers disabled on mount
// (most commonly under React StrictMode's double-invoked effects in dev mode).
// Explicitly (re-)enabling them on the live map instance fixes "zoom works but
// pan doesn't" reliably.
const EnableMapInteractions: React.FC = () => {
  const map = useMap();
  useEffect(() => {
    map.dragging.enable();
    map.touchZoom.enable();
    map.doubleClickZoom.enable();
    map.scrollWheelZoom.enable();
    map.boxZoom.enable();
    map.keyboard.enable();

    // Leaflet-in-a-container sizing bug: if the map's container wasn't at its
    // final pixel size the instant Leaflet measured it on mount, its internal
    // drag-pan bounds go stale — zoom still works (recalculates every time),
    // but panning silently does nothing. Re-measuring once layout settles
    // fixes it.
    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize({ animate: false });
    }, 100);

    return () => window.clearTimeout(resizeTimer);
  }, [map]);
  return null;
};

// Defensive override: some global stylesheets set an app-wide `touch-action`
// that can load after leaflet.css and silently win the cascade, blocking
// touch/trackpad panning even though mouse-drag still works. This guarantees
// Leaflet's own container behavior always wins, regardless of index.css.
const MapTouchActionFix: React.FC = () => (
  <style>{`
    .leaflet-container { touch-action: none !important; }
  `}</style>
);

function timeAgo(ts: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
}

export const LiveLocationViewer: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [session, setSession] = useState<LiveSession | null>(null);
  const [status, setStatus] = useState<'loading' | 'live' | 'ended' | 'not-found' | 'error'>('loading');
  const [now, setNow] = useState(Date.now());
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const res = await fetch(`/api/live-location/${sessionId}`);
        if (res.status === 404) {
          setStatus('not-found');
          return;
        }
        const data: LiveSession = await res.json();
        setSession(data);
        setStatus(data.active ? 'live' : 'ended');
      } catch (err) {
        console.error(err);
        setStatus('error');
      }
    };

    fetchSession();
    pollRef.current = window.setInterval(fetchSession, POLL_INTERVAL_MS);
    const tickRef = window.setInterval(() => setNow(Date.now()), 1000);

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      window.clearInterval(tickRef);
    };
  }, [sessionId]);

  return (
    <div className="min-h-screen bg-[#FCF7F1] flex flex-col">
      <header className="border-b border-[#EFE6E1] bg-white/80 backdrop-blur px-4 py-3 flex items-center gap-2">
        <GuardIaLogo size="sm" showText={false} />
        <span className="font-bold text-[#31141E]">Safera Live Location</span>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto p-4 flex flex-col gap-4">
        {status === 'loading' && (
          <div className="flex-1 flex items-center justify-center text-[#825D6B] text-sm">
            Loading live location…
          </div>
        )}

        {status === 'not-found' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 text-[#31141E] py-16">
            <AlertTriangle className="w-8 h-8 text-[#A70F43]" />
            <h2 className="font-bold text-lg">This link isn't active</h2>
            <p className="text-sm text-[#825D6B] max-w-xs">
              The live location session doesn't exist, has expired, or the link is incorrect.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 text-[#31141E] py-16">
            <AlertTriangle className="w-8 h-8 text-[#A70F43]" />
            <h2 className="font-bold text-lg">Couldn't load this location</h2>
            <p className="text-sm text-[#825D6B] max-w-xs">Check your connection and try refreshing the page.</p>
          </div>
        )}

        {session && (status === 'live' || status === 'ended') && (
          <>
            <div className="bg-white rounded-[22px] border border-[#F2E5DE] p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                    status === 'live' ? 'bg-[#F7E5EC]' : 'bg-[#F1F1F1]'
                  }`}
                >
                  {status === 'live' ? (
                    <RadioTower className="w-5 h-5 text-[#8A1E41]" />
                  ) : (
                    <MapPin className="w-5 h-5 text-[#6E676A]" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-[#31141E]">{session.label}</h3>
                  <p className="text-xs text-[#825D6B]">
                    {status === 'live'
                      ? `Live • updated ${timeAgo(session.updatedAt)}`
                      : `Sharing ended • last seen ${timeAgo(session.updatedAt)}`}
                  </p>
                </div>
              </div>
              {status === 'live' && (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-[#8A1E41]">
                  <span className="w-2 h-2 rounded-full bg-[#8A1E41] animate-pulse" />
                  LIVE
                </span>
              )}
            </div>

            <div className="relative w-full h-[440px] rounded-[22px] overflow-hidden border border-[#EFE6E1]">
              <MapContainer center={[session.lat, session.lng]} zoom={16} style={{ height: '100%', width: '100%' }} dragging scrollWheelZoom doubleClickZoom touchZoom zoomControl>
                <TileLayer
                  attribution="&copy; OpenStreetMap contributors &copy; CARTO"
                  url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                  subdomains="abcd"
                  maxZoom={19}
                />
                <Marker position={[session.lat, session.lng]} icon={personIcon}>
                  <Popup>
                    {session.label}
                    <br />
                    {status === 'live' ? 'Live position' : 'Last known position'}
                  </Popup>
                </Marker>
                {status === 'live' && <Recenter lat={session.lat} lng={session.lng} />}
                <EnableMapInteractions />
              </MapContainer>
              <MapTouchActionFix />
            </div>

            <p className="text-[11px] text-[#825D6B] text-center">
              {status === 'live'
                ? 'This page refreshes automatically while location sharing is active.'
                : 'This person has stopped sharing their live location.'}
            </p>
          </>
        )}
      </main>
    </div>
  );
};