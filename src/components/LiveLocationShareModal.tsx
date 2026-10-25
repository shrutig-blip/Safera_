import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { X, Copy, Check, RadioTower, AlertTriangle, Share2, Loader2 } from 'lucide-react';

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

    // Leaflet-in-a-modal sizing bug: if the container wasn't at its final
    // pixel size the instant Leaflet measured it on mount (very common right
    // after a modal/flex layout renders), Leaflet's internal drag-pan bounds
    // go stale — zoom still works (it recalculates every time), but panning
    // silently does nothing. Re-measuring once layout settles fixes it.
    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize({ animate: false });
    }, 100);

    return () => window.clearTimeout(resizeTimer);
  }, [map]);
  return null;
};

// Defensive override: some global stylesheets set an app-wide `touch-action`
// (e.g. to kill double-tap-zoom on mobile) that can load after leaflet.css
// and silently win the cascade, blocking touch/trackpad panning even though
// mouse-drag still works. This guarantees Leaflet's own container behavior
// always wins, regardless of what index.css does.
const MapTouchActionFix: React.FC = () => (
  <style>{`
    .leaflet-container { touch-action: none !important; }
  `}</style>
);

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

interface LiveLocationShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  locationLabel?: string;
}

type FlowState = 'requesting' | 'live' | 'error' | 'stopped';

export const LiveLocationShareModal: React.FC<LiveLocationShareModalProps> = ({
  isOpen,
  onClose,
  locationLabel,
}) => {
  const [flowState, setFlowState] = useState<FlowState>('requesting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareNote, setShareNote] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);

  const watchIdRef = useRef<number | null>(null);

  const liveUrl = sessionId ? `${window.location.origin}/live/${sessionId}` : '';

  const cleanupWatch = () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
  };

  const startSharing = () => {
    setFlowState('requesting');
    setErrorMessage(null);

    if (!('geolocation' in navigator)) {
      setFlowState('error');
      setErrorMessage('Geolocation is not supported on this device/browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude, accuracy } = position.coords;
        setCoords({ lat: latitude, lng: longitude });

        try {
          const startRes = await fetch('/api/live-location/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat: latitude, lng: longitude, accuracy, label: locationLabel || 'Safera User' }),
          });
          if (!startRes.ok) throw new Error('start failed');
          const session = await startRes.json();

          setSessionId(session.id);
          setStartedAt(Date.now());
          setFlowState('live');

          watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
              setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
              fetch(`/api/live-location/${session.id}/update`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  lat: pos.coords.latitude,
                  lng: pos.coords.longitude,
                  accuracy: pos.coords.accuracy,
                }),
              }).catch((err) => console.error('Failed to push location update', err));
            },
            (err) => console.error('watchPosition error', err),
            { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
          );
        } catch (err) {
          console.error(err);
          setFlowState('error');
          setErrorMessage('Could not start the live session. Please check your connection and try again.');
        }
      },
      (error) => {
        setFlowState('error');
        if (error.code === error.PERMISSION_DENIED) {
          setErrorMessage('Location permission denied. Allow location access in your browser to share your position.');
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setErrorMessage('Location unavailable right now. Try again in an open area.');
        } else if (error.code === error.TIMEOUT) {
          setErrorMessage('Timed out getting your location. Please try again.');
        } else {
          setErrorMessage('Could not get your location.');
        }
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const stopSharing = async () => {
    cleanupWatch();
    if (sessionId) {
      try {
        await fetch(`/api/live-location/${sessionId}/stop`, { method: 'POST' });
      } catch (err) {
        console.error('Failed to stop live location session', err);
      }
    }
    setFlowState('stopped');
  };

  const handleCopyLink = async () => {
    if (!liveUrl) return;
    try {
      await navigator.clipboard.writeText(liveUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setShareNote('Could not copy automatically — select and copy the link above.');
    }
  };

  const handleNativeShare = async () => {
    if (!liveUrl) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'My Live Location',
          text: "I'm sharing my live location with you via Safera.",
          url: liveUrl,
        });
      } else {
        await handleCopyLink();
        setShareNote('Sharing not supported here — link copied instead.');
      }
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        setShareNote('Could not open the share sheet. Use the copy button instead.');
      }
    }
  };

  // Kick off the flow as soon as the modal opens.
  useEffect(() => {
    if (isOpen) {
      startSharing();
    } else {
      cleanupWatch();
      setFlowState('requesting');
      setErrorMessage(null);
      setCoords(null);
      setSessionId(null);
      setStartedAt(null);
      setCopied(false);
      setShareNote(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // Clean up any active geolocation watch if the modal unmounts unexpectedly.
  useEffect(() => {
    return () => cleanupWatch();
  }, []);

  useEffect(() => {
    if (flowState !== 'live' || !startedAt) return;
    const tick = window.setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000);
    return () => window.clearInterval(tick);
  }, [flowState, startedAt]);

  const handleClose = () => {
    // Sharing keeps running in the background if the user just closes the modal;
    // only stop it explicitly via the Stop button.
    onClose();
  };

  if (!isOpen) return null;

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-[26px] w-full max-w-md shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F2E5DE]">
          <div className="flex items-center gap-2">
            <Share2 className="w-5 h-5 text-[#8A1E41]" />
            <h3 className="font-bold text-[#31141E]">Share Live Location</h3>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-[#F7F1EC] flex items-center justify-center hover:bg-[#F2E5DE] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-[#6E676A]" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          {flowState === 'requesting' && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <Loader2 className="w-8 h-8 text-[#8A1E41] animate-spin" />
              <p className="text-sm font-semibold text-[#31141E]">Getting your location…</p>
              <p className="text-xs text-[#825D6B] max-w-[260px]">
                Your browser may ask for location permission — allow it to start sharing.
              </p>
            </div>
          )}

          {flowState === 'error' && (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <AlertTriangle className="w-8 h-8 text-[#A70F43]" />
              <p className="text-sm font-semibold text-[#31141E]">Couldn't start sharing</p>
              <p className="text-xs text-[#825D6B] max-w-[280px]">{errorMessage}</p>
              <button
                onClick={startSharing}
                className="mt-2 px-4 py-2 rounded-full bg-[#8A1E41] text-white text-xs font-semibold hover:bg-[#71183590] transition-colors"
              >
                Try again
              </button>
            </div>
          )}

          {flowState === 'stopped' && (
            <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
              <Check className="w-8 h-8 text-[#2E7D32]" />
              <p className="text-sm font-semibold text-[#31141E]">Live sharing stopped</p>
              <p className="text-xs text-[#825D6B] max-w-[260px]">
                Your contacts can no longer see your position from the shared link.
              </p>
            </div>
          )}

          {flowState === 'live' && coords && (
            <>
              <div className="flex items-center justify-between bg-[#FDF0E6] rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#8A1E41] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#8A1E41]" />
                  </span>
                  <span className="text-xs font-bold text-[#8A1E41]">LIVE</span>
                  <RadioTower className="w-4 h-4 text-[#8A1E41]" />
                </div>
                <span className="text-xs font-mono text-[#31141E]">
                  {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                </span>
              </div>

              <div className="relative w-full h-[240px] rounded-2xl overflow-hidden border border-[#EFE6E1]">
                <MapContainer
                  center={[coords.lat, coords.lng]}
                  zoom={16}
                  style={{ height: '100%', width: '100%' }}
                  dragging
                  scrollWheelZoom
                  doubleClickZoom
                  touchZoom
                  zoomControl
                >
                  <TileLayer
                    attribution="&copy; OpenStreetMap contributors &copy; CARTO"
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                    subdomains="abcd"
                    maxZoom={19}
                  />
                  <Marker position={[coords.lat, coords.lng]} icon={personIcon}>
                    <Popup>You are here</Popup>
                  </Marker>
                  <EnableMapInteractions />
                </MapContainer>
                <MapTouchActionFix />
              </div>

              <div>
                <p className="text-xs font-semibold text-[#31141E] mb-1.5">Shareable link</p>
                <div className="flex items-center gap-2 bg-[#F7F1EC] rounded-xl px-3 py-2.5">
                  <span className="flex-1 text-xs text-[#6E676A] truncate">{liveUrl}</span>
                  <button
                    onClick={handleCopyLink}
                    className="shrink-0 w-7 h-7 rounded-full bg-white flex items-center justify-center hover:bg-[#F2E5DE] transition-colors"
                    aria-label="Copy link"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-[#2E7D32]" /> : <Copy className="w-3.5 h-3.5 text-[#8A1E41]" />}
                  </button>
                </div>
                {shareNote && <p className="text-[11px] text-[#825D6B] mt-1.5">{shareNote}</p>}
              </div>

              <div className="flex gap-2.5">
                <button
                  onClick={handleNativeShare}
                  className="flex-1 flex items-center justify-center gap-2 rounded-full bg-[#8A1E41] text-white text-sm font-semibold py-2.5 hover:bg-[#71183590] transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                  Share link
                </button>
                <button
                  onClick={stopSharing}
                  className="flex-1 rounded-full border border-[#E9D8DE] text-[#A70F43] text-sm font-semibold py-2.5 hover:bg-[#FFF8F9] transition-colors"
                >
                  Stop sharing
                </button>
              </div>

              <p className="text-[11px] text-[#825D6B] text-center">
                Anyone with this link can watch your position update in real time until you stop sharing.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};