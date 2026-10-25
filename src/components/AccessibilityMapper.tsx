import React, { useEffect, useState } from 'react';
import { SafetyLocation } from '../types';
import { fetchNearbyAccessiblePlaces, AccessiblePlace } from '../lib/osmAccessibility';
import {
  Shield,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Search,
  Filter,
  MapPin,
  Heart,
  Navigation,
  Accessibility,
  Footprints,
  Sun,
  Activity,
  Loader2,
  WifiOff,
} from 'lucide-react';

interface AccessibilityMapperProps {
  /**
   * Static demo locations — used ONLY as a fallback while real data is
   * loading, or if geolocation/OpenStreetMap is unavailable. The primary
   * data source is now live: fetchNearbyAccessiblePlaces() below.
   */
  locations: SafetyLocation[];
  onSelectLocationForRoute: (loc: SafetyLocation) => void;
}

type DataStatus = 'loading' | 'live' | 'fallback' | 'denied';

export const AccessibilityMapper: React.FC<AccessibilityMapperProps> = ({
  locations,
  onSelectLocationForRoute,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRamps, setFilterRamps] = useState(false);
  const [filterStepFree, setFilterStepFree] = useState(false);
  const [filterWashrooms, setFilterWashrooms] = useState(false);
  const [filterLighting, setFilterLighting] = useState(false);
  const [filterPolice, setFilterPolice] = useState(false);
  const [filterTactile, setFilterTactile] = useState(false);

  const [dataStatus, setDataStatus] = useState<DataStatus>('loading');
  const [realPlaces, setRealPlaces] = useState<AccessiblePlace[]>([]);

  useEffect(() => {
    if (!navigator.geolocation) {
      setDataStatus('denied');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const results = await fetchNearbyAccessiblePlaces(pos.coords.latitude, pos.coords.longitude);
          if (results.length === 0) {
            setDataStatus('fallback');
            return;
          }
          setRealPlaces(results);
          setDataStatus('live');
        } catch (err) {
          console.error('Overpass accessibility fetch failed, falling back to demo data', err);
          setDataStatus('fallback');
        }
      },
      (err) => {
        console.warn('Geolocation permission denied/unavailable', err);
        setDataStatus('denied');
      },
      { timeout: 8000 }
    );
  }, []);

  // Converts a real OSM place into the shape onSelectLocationForRoute (and
  // therefore RouteGenerator) expects. RouteGenerator only ever reads
  // id/name/lat/lng from this object — the other SafetyLocation fields
  // have no real public-data equivalent (no open dataset tracks a
  // crowd-safety "trust score" or FIR count per place), so they're filled
  // with clearly-neutral, unused placeholders rather than fabricated
  // numbers presented as real anywhere in the UI.
  const toRoutableLocation = (place: AccessiblePlace): SafetyLocation => ({
    id: place.id,
    name: place.name,
    area: place.amenityType,
    lat: place.lat,
    lng: place.lng,
    safetyScore: 0,
    riskLevel: 'Safe',
    firCount: 0,
    recentSosCount: 0,
    crowdDensity: 'Moderate',
    lightingStars: 0,
    roadType: 'Pedestrian Walkway',
    policeDistanceMeters: place.nearestPoliceDistanceMeters ?? 0,
    cctvPercent: 0,
    accessibility: {
      wheelchairRamps: !!place.accessibility.wheelchairRamps,
      stepFreeEntrances: !!place.accessibility.stepFreeEntrances,
      cctvCoverage: !!place.accessibility.cctvCoverage,
      smoothFootpaths: false,
      goodStreetlights: !!place.accessibility.goodStreetlights,
      accessiblePublicWashrooms: !!place.accessibility.accessiblePublicWashrooms,
      policeBooths: !!place.accessibility.policeBooths,
      phoneBooths: !!place.accessibility.phoneBooths,
      brailleSignage: !!place.accessibility.brailleSignage,
      elevatorAccess: false,
      tactilePaving: !!place.accessibility.tactilePaving,
    },
    trustScore: 0,
    reportCount: 0,
  });

  const isLive = dataStatus === 'live';

  const filteredReal = realPlaces.filter((p) => {
    if (searchQuery && !p.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (filterRamps && p.accessibility.wheelchairRamps !== true) return false;
    if (filterStepFree && p.accessibility.stepFreeEntrances !== true) return false;
    if (filterWashrooms && p.accessibility.accessiblePublicWashrooms !== true) return false;
    if (filterLighting && p.accessibility.goodStreetlights !== true) return false;
    if (filterPolice && p.accessibility.policeBooths !== true) return false;
    if (filterTactile && p.accessibility.tactilePaving !== true) return false;
    return true;
  });

  const filteredFallback = locations.filter((loc) => {
    if (searchQuery && !loc.name.toLowerCase().includes(searchQuery.toLowerCase()) && !loc.area.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (filterRamps && !loc.accessibility.wheelchairRamps) return false;
    if (filterStepFree && !loc.accessibility.stepFreeEntrances) return false;
    if (filterWashrooms && !loc.accessibility.accessiblePublicWashrooms) return false;
    if (filterLighting && !loc.accessibility.goodStreetlights) return false;
    if (filterPolice && !loc.accessibility.policeBooths) return false;
    if (filterTactile && !loc.accessibility.tactilePaving) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-white border border-[#EFE6E1] rounded-[24px] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center space-x-1.5 px-3 py-1 rounded-full bg-[#FFF0F3] text-[#A70F43] border border-[#EFE6E1] text-xs font-semibold mb-1.5">
              <Heart className="w-3.5 h-3.5 text-[#A70F43] fill-[#A70F43]" />
              <span>Elderly & Differently Abled Safe Spaces</span>
            </div>
            <h2 className="text-2xl font-bold text-[#221F20] tracking-tight">Accessibility Safety Mapper</h2>
            <p className="text-[15px] text-[#6E676A] mt-1">
              Inspect step-free entrances, wheelchair ramps, accessible washrooms, and police kiosks.
            </p>
          </div>

          {/* Quick Search */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-[#6E676A]" />
            <input
              type="text"
              placeholder="Search place name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#FEFCFA] border border-[#EFE6E1] rounded-full pl-10 pr-4 py-2.5 text-xs text-[#221F20] placeholder-[#6E676A] focus:outline-none focus:border-[#A70F43]"
            />
          </div>
        </div>

        {/* Live data status banner */}
        {dataStatus === 'loading' && (
          <div className="flex items-center gap-2 bg-[#FFF8F9] border border-[#EFE6E1] rounded-xl px-3 py-2 text-xs text-[#6E676A]">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#A70F43]" />
            <span>Finding real accessible places near you via OpenStreetMap...</span>
          </div>
        )}
        {dataStatus === 'live' && (
          <div className="flex items-center gap-2 bg-[#F0FBF4] border border-[#D7F0DE] rounded-xl px-3 py-2 text-xs text-[#2F6B44]">
            <span className="w-2 h-2 rounded-full bg-[#5FA777]" />
            <span>
              Live — {realPlaces.length} real nearby places from OpenStreetMap contributors. Fields left blank mean
              that feature hasn't been mapped there yet, not that it's absent.
            </span>
          </div>
        )}
        {(dataStatus === 'fallback' || dataStatus === 'denied') && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800">
            <WifiOff className="w-3.5 h-3.5 shrink-0" />
            <span>
              {dataStatus === 'denied'
                ? 'Location access is off, so this is showing demo data, not real nearby places. Enable location to see real accessibility data near you.'
                : "Couldn't find enough real accessibility data near you right now — showing demo data instead."}
            </span>
          </div>
        )}

        {/* Feature Filters Chips */}
        <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#EFE6E1]">
          <span className="text-xs font-semibold text-[#6E676A] flex items-center gap-1 mr-1">
            <Filter className="w-3.5 h-3.5" />
            Filter:
          </span>

          <button
            onClick={() => setFilterRamps(!filterRamps)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5 transition-all ${
              filterRamps
                ? 'bg-[#A70F43] text-white border-[#8D0D39]'
                : 'bg-[#FEFCFA] text-[#221F20] border-[#EFE6E1] hover:bg-[#FFF0F3]'
            }`}
          >
            <Accessibility className="w-3.5 h-3.5 text-[#A70F43]" />
            <span>Wheelchair Ramps</span>
          </button>

          <button
            onClick={() => setFilterStepFree(!filterStepFree)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5 transition-all ${
              filterStepFree
                ? 'bg-[#A70F43] text-white border-[#8D0D39]'
                : 'bg-[#FEFCFA] text-[#221F20] border-[#EFE6E1] hover:bg-[#FFF0F3]'
            }`}
          >
            <Footprints className="w-3.5 h-3.5 text-[#A70F43]" />
            <span>Step-Free Entrances</span>
          </button>

          <button
            onClick={() => setFilterWashrooms(!filterWashrooms)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5 transition-all ${
              filterWashrooms
                ? 'bg-[#A70F43] text-white border-[#8D0D39]'
                : 'bg-[#FEFCFA] text-[#221F20] border-[#EFE6E1] hover:bg-[#FFF0F3]'
            }`}
          >
            <Heart className="w-3.5 h-3.5 text-[#A70F43]" />
            <span>Accessible Washrooms</span>
          </button>

          <button
            onClick={() => setFilterLighting(!filterLighting)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5 transition-all ${
              filterLighting
                ? 'bg-[#A70F43] text-white border-[#8D0D39]'
                : 'bg-[#FEFCFA] text-[#221F20] border-[#EFE6E1] hover:bg-[#FFF0F3]'
            }`}
          >
            <Sun className="w-3.5 h-3.5 text-[#A70F43]" />
            <span>Good Lighting</span>
          </button>

          <button
            onClick={() => setFilterPolice(!filterPolice)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5 transition-all ${
              filterPolice
                ? 'bg-[#A70F43] text-white border-[#8D0D39]'
                : 'bg-[#FEFCFA] text-[#221F20] border-[#EFE6E1] hover:bg-[#FFF0F3]'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-[#A70F43]" />
            <span>Police Kiosks</span>
          </button>

          <button
            onClick={() => setFilterTactile(!filterTactile)}
            className={`px-3.5 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5 transition-all ${
              filterTactile
                ? 'bg-[#A70F43] text-white border-[#8D0D39]'
                : 'bg-[#FEFCFA] text-[#221F20] border-[#EFE6E1] hover:bg-[#FFF0F3]'
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-[#A70F43]" />
            <span>Tactile Paving</span>
          </button>

          {(filterRamps || filterStepFree || filterWashrooms || filterLighting || filterPolice || filterTactile) && (
            <button
              onClick={() => {
                setFilterRamps(false);
                setFilterStepFree(false);
                setFilterWashrooms(false);
                setFilterLighting(false);
                setFilterPolice(false);
                setFilterTactile(false);
              }}
              className="px-3 py-1.5 text-xs text-[#A70F43] underline ml-auto"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Accessible Places Directory Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {isLive
          ? filteredReal.map((place) => (
              <div
                key={place.id}
                className="bg-white border border-[#EFE6E1] rounded-[24px] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-4 hover:border-[#A70F43] transition-colors flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between border-b border-[#EFE6E1] pb-3 gap-2">
                    <div>
                      <span className="text-xs font-medium text-[#6E676A] capitalize">{place.amenityType}</span>
                      <h3 className="text-[18px] font-semibold text-[#221F20] mt-0.5">{place.name}</h3>
                    </div>
                  </div>

                  <div className="flex items-center space-x-3 text-xs text-[#6E676A] my-3">
                    {place.nearestPoliceDistanceMeters !== null ? (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-[#A70F43]" />
                        <span>Nearest police: {place.nearestPoliceDistanceMeters}m</span>
                      </span>
                    ) : (
                      <span className="text-[#6E676A]/70">No police station mapped nearby</span>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <FeatureBadge label="Wheelchair Ramps" state={place.accessibility.wheelchairRamps} />
                    <FeatureBadge label="Step-Free Entrances" state={place.accessibility.stepFreeEntrances} />
                    <FeatureBadge label="CCTV Coverage" state={place.accessibility.cctvCoverage} />
                    <FeatureBadge label="Good Streetlights" state={place.accessibility.goodStreetlights} />
                    <FeatureBadge label="Accessible Washroom" state={place.accessibility.accessiblePublicWashrooms} />
                    <FeatureBadge label="Police Booth Nearby" state={place.accessibility.policeBooths} />
                    <FeatureBadge label="Phone Kiosk Nearby" state={place.accessibility.phoneBooths} />
                    <FeatureBadge label="Braille Signage" state={place.accessibility.brailleSignage} />
                    <FeatureBadge label="Tactile Paving" state={place.accessibility.tactilePaving} />
                  </div>
                </div>

                <div className="pt-3 border-t border-[#EFE6E1] flex items-center justify-between gap-3">
                  <span className="text-xs text-[#6E676A]">Source: OpenStreetMap contributors</span>
                  <button
                    onClick={() => onSelectLocationForRoute(toRoutableLocation(place))}
                    className="px-4 py-2 rounded-full bg-[#A70F43] hover:bg-[#8D0D39] text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
                  >
                    <Navigation className="w-3.5 h-3.5" />
                    <span>Route Here</span>
                  </button>
                </div>
              </div>
            ))
          : filteredFallback.map((loc) => {
              const acc = loc.accessibility;
              const totalFeatures = Object.values(acc).filter(Boolean).length;
              const totalPossible = Object.keys(acc).length;
              const scorePercent = Math.round((totalFeatures / totalPossible) * 100);

              return (
                <div
                  key={loc.id}
                  className="bg-white border border-[#EFE6E1] rounded-[24px] p-5 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-4 hover:border-[#A70F43] transition-colors flex flex-col justify-between opacity-90"
                >
                  <div>
                    <div className="flex items-start justify-between border-b border-[#EFE6E1] pb-3 gap-2">
                      <div>
                        <span className="text-xs font-medium text-[#6E676A]">{loc.area} · Demo data</span>
                        <h3 className="text-[18px] font-semibold text-[#221F20] mt-0.5">{loc.name}</h3>
                      </div>
                      <div className="bg-[#FFF0F3] border border-[#EFE6E1] text-[#221F20] rounded-[16px] px-3 py-1.5 text-center shrink-0">
                        <div className="text-[10px] font-medium text-[#6E676A]">Accessibility</div>
                        <div className="text-base font-bold text-[#A70F43]">{scorePercent}%</div>
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 text-xs text-[#6E676A] my-3">
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-[#A70F43]" />
                        <span>{loc.roadType}</span>
                      </span>
                      <span>•</span>
                      <span>Police: {loc.policeDistanceMeters}m away</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <FeatureBadge label="Wheelchair Ramps" state={acc.wheelchairRamps} />
                      <FeatureBadge label="Step-Free Entrances" state={acc.stepFreeEntrances} />
                      <FeatureBadge label="CCTV Coverage" state={acc.cctvCoverage} />
                      <FeatureBadge label="Smooth Footpaths" state={acc.smoothFootpaths} />
                      <FeatureBadge label="Good Streetlights" state={acc.goodStreetlights} />
                      <FeatureBadge label="Accessible Washroom" state={acc.accessiblePublicWashrooms} />
                      <FeatureBadge label="Police Booth" state={acc.policeBooths} />
                      <FeatureBadge label="Phone Kiosk" state={acc.phoneBooths} />
                      <FeatureBadge label="Braille Signage" state={acc.brailleSignage} />
                      <FeatureBadge label="Tactile Paving" state={acc.tactilePaving} />
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[#EFE6E1] flex items-center justify-between gap-3">
                    <span className="text-xs text-[#6E676A]">
                      Trust Index: <strong className="text-[#221F20]">{loc.trustScore}% Verified</strong>
                    </span>
                    <button
                      onClick={() => onSelectLocationForRoute(loc)}
                      className="px-4 py-2 rounded-full bg-[#A70F43] hover:bg-[#8D0D39] text-white font-semibold text-xs flex items-center gap-1.5 transition-colors shadow-xs"
                    >
                      <Navigation className="w-3.5 h-3.5" />
                      <span>Route Here</span>
                    </button>
                  </div>
                </div>
              );
            })}
      </div>
    </div>
  );
};

/**
 * Three real states, not two: `true` (confirmed present), `false`
 * (confirmed absent — only used by the demo-data fallback, which has
 * fabricated booleans for every field), and `undefined` (not mapped in
 * OpenStreetMap — genuinely unknown, shown distinctly rather than lumped
 * in with "absent").
 */
const FeatureBadge: React.FC<{ label: string; state: boolean | undefined }> = ({ label, state }) => (
  <div
    className={`p-2 rounded-[12px] border flex items-center gap-2 text-xs ${
      state === true
        ? 'bg-[#FFF0F3] border-[#EFE6E1] text-[#A70F43] font-medium'
        : state === false
        ? 'bg-[#FEFCFA] border-[#EFE6E1] text-[#6E676A]'
        : 'bg-[#FEFCFA] border-dashed border-[#EFE6E1] text-[#A8A19E]'
    }`}
  >
    {state === true ? (
      <CheckCircle2 className="w-4 h-4 text-[#5FA777] shrink-0" />
    ) : state === false ? (
      <XCircle className="w-4 h-4 text-slate-300 shrink-0" />
    ) : (
      <HelpCircle className="w-4 h-4 text-[#C9C2BE] shrink-0" />
    )}
    <span className="line-clamp-1">{label}</span>
  </div>
);
