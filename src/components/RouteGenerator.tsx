import React, { useState, useEffect, useRef } from "react";

import { RouteOption, SafetyLocation } from "../types";
import { GuardIaLogo } from "./GuardIaLogo";
import { LiveRouteMap } from "./LiveRouteMap";
import { geocodePlace, GeocodedPlace } from "../lib/geocode";
import { PlaceAutocomplete } from "./PlaceAutocomplete";
import {
  getWalkingRoutes,
  formatDistance,
  formatDuration,
  LatLng,
  RouteStep,
} from "../lib/routing";
import { scoreRoutePath, TimeOfDay as GridTimeOfDay } from "../utils/hotspot";
import { fetchOsmFacts, OsmFacts } from "../lib/osmFacts";
import { CommunityReport } from "../types";

import {
  Shield,
  Navigation,
  AlertTriangle,
  CheckCircle2,
  Clock,
  MapPin,
  Sparkles,
  Footprints,
  ChevronRight,
  Accessibility,
  ArrowRight,
} from "lucide-react";

interface RouteGeneratorProps {
  locations: SafetyLocation[];
  reports: CommunityReport[];
  selectedLocationTarget?: SafetyLocation;
  onStartNavigation: (route: RouteOption) => void;
}

// A RouteOption plus the real routed data it was computed from. Extending it
// here (instead of editing types.ts) keeps every other feature untouched —
// onStartNavigation still receives a valid RouteOption.
type RouteCard = RouteOption & {
  path: LatLng[];
  steps: RouteStep[];
  distanceMeters: number;
  dataCoverage: number;
  insufficientData: boolean;
  lightingKnown: boolean;
  accessibilityKnown: boolean;
  osmChecked?: boolean;
};

/**
 * How much real OpenStreetMap context should nudge a route's score.
 * Deterministic and explainable: main roads carry more traffic/visibility,
 * public places (fuel stations, hospitals, transit) mean people and staff
 * nearby, a police station nearby helps, and — after dark only — mapped
 * lighting helps or hurts.
 */
function osmScoreAdjust(o: OsmFacts, dark: boolean): number {
  let d = 0;
  if (o.mainRoadShare !== null) d += Math.round((o.mainRoadShare - 0.4) * 20); // -8 .. +12
  d += Math.min(8, Math.round(o.publicPlacesPerKm * 2)); // 0 .. +8
  if (o.policeCount > 0) d += 5;
  if (dark && o.lightingPercent !== null) d += Math.round((o.lightingPercent - 50) * 0.15);
  return d;
}

export const RouteGenerator: React.FC<RouteGeneratorProps> = ({
  locations,
  reports,
  selectedLocationTarget,
  onStartNavigation,
}) => {
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState(
    selectedLocationTarget ? selectedLocationTarget.name : "",
  );
  const [timeOfDay, setTimeOfDay] = useState<"Day" | "Evening" | "Late Night">(
    "Late Night",
  );
  const [transportMode, setTransportMode] = useState<
    "Walking" | "Wheelchair / Assistive" | "Solo Transit"
  >("Walking");

  const [isLoading, setIsLoading] = useState(false);
  const [routes, setRoutes] = useState<RouteCard[]>([]);

  const [activeRouteId, setActiveRouteId] = useState<string>("");
  const [originCoords, setOriginCoords] = useState<GeocodedPlace | null>(null);
  const [destinationCoords, setDestinationCoords] =
    useState<GeocodedPlace | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  const [originReady, setOriginReady] = useState(false);
  const lastAutoRoutedTargetId = useRef<string | null>(null);

  const runRouteGeneration = async (
    originPlace: GeocodedPlace,
    destinationPlace: GeocodedPlace,
  ) => {
    setIsLoading(true);
    setMapError(null);
    try {
      setOriginCoords(originPlace);
      setDestinationCoords(destinationPlace);

      // 1. Real walking routes (geometry, distance, time, turn-by-turn steps).
      const realRoutes = await getWalkingRoutes(
        { lat: originPlace.lat, lng: originPlace.lng },
        { lat: destinationPlace.lat, lng: destinationPlace.lng },
      );
      console.log(
        `Found ${realRoutes.length} distinct walking route(s) for this trip.`,
      );

      const gridTimeOfDay: GridTimeOfDay =
        timeOfDay === "Evening" ? "Dusk" : timeOfDay;
      const dark = gridTimeOfDay !== "Day";

      // 2. Score every route against your logged locations and reports.
      const cards: RouteCard[] = realRoutes.map((r, idx) => {
        const a = scoreRoutePath(r.coordinates, locations, reports, gridTimeOfDay);

        const highlights: string[] = [];
        if (a.policeBoothNearby) {
          highlights.push("Passes within 400 m of a logged police booth");
        }
        if (a.cctvKnown && a.cctvPercent >= 50) {
          highlights.push(`${a.cctvPercent}% average CCTV coverage near this path`);
        }
        if (a.lightingKnown && a.lightingPercent >= 70) {
          highlights.push(`Well-lit stretches (${a.lightingPercent}% average lighting)`);
        }

        return {
          id: `route-${idx}`,
          name: `via ${r.viaLabel ?? "local roads"}`,
          tag: "Alternate",
          distance: formatDistance(r.distanceMeters),
          estimatedTime: formatDuration(r.durationSeconds),
          safetyScore: a.pathSafetyScore,
          lightingPercent: a.lightingPercent,
          accessibilityScore: a.accessibilityPercent,
          cctvCoverage: a.cctvPercent,
          policeBoothNearby: a.policeBoothNearby,
          highlights,
          riskSegments: a.riskSegments,
          path: r.coordinates,
          steps: r.steps,
          distanceMeters: r.distanceMeters,
          dataCoverage: a.dataCoveragePercent,
          insufficientData: a.insufficientData,
          lightingKnown: a.lightingKnown,
          accessibilityKnown: a.accessibilityKnown,
        } as RouteCard;
      });

      // 3. Layer in real OpenStreetMap facts (stairs, police stations, lit
      //    roads, main-road share, public places). If OpenStreetMap is
      //    unreachable, the cards simply keep the scores computed above.
      const osmResults = await Promise.all(
        realRoutes.map((r) => fetchOsmFacts(r.coordinates, r.distanceMeters)),
      );
      let osmFailures = 0;
      cards.forEach((c, i) => {
        const o = osmResults[i];
        if (!o) {
          osmFailures++;
          return;
        }
        c.osmChecked = true;

        // score nudge from real map context
        c.safetyScore = Math.min(95, Math.max(5, c.safetyScore + osmScoreAdjust(o, dark)));

        if (o.lightingPercent !== null) {
          c.lightingPercent = o.lightingPercent;
          c.lightingKnown = true;
        }
        if (o.stepFreePercent !== null) {
          c.accessibilityScore = o.stepFreePercent;
          c.accessibilityKnown = true;
        }

        // positives
        if (o.policeCount > 0 && !c.policeBoothNearby) {
          c.policeBoothNearby = true;
        }
        if (o.policeCount > 0) {
          c.highlights.push(
            `${o.policeCount} police station${o.policeCount > 1 ? "s" : ""} within 400 m of the route (nearest ${o.nearestPoliceMeters} m)`,
          );
        }
        if (o.mainRoadShare !== null && o.mainRoadShare >= 0.5) {
          c.highlights.push(
            `${Math.round(o.mainRoadShare * 100)}% of the route follows main roads`,
          );
        }
        if (o.publicPlaces > 0) {
          c.highlights.push(
            `${o.publicPlaces} public place${o.publicPlaces > 1 ? "s" : ""} along the route (fuel stations, hospitals, metro/bus stops)`,
          );
        }
        if (o.lampsPerKm >= 8) {
          c.highlights.push(`About ${Math.round(o.lampsPerKm)} mapped streetlights per km`);
        }
        if (o.stairCount === 0 && o.stepFreePercent !== null) {
          c.highlights.push("No staircases found on this route");
        }

        // things to know (real findings only)
        const warnings: string[] = [];
        if (o.stairCount > 0) {
          warnings.push(
            `${o.stairCount} staircase${o.stairCount > 1 ? "s" : ""} on this route — not step-free`,
          );
        }
        if (dark && o.policeCount === 0) {
          warnings.push("No police station mapped within 400 m of this route");
        }
        if (dark && o.publicPlaces === 0) {
          warnings.push("No fuel stations, hospitals or transit stops mapped along this route — fewer people around late at night");
        }
        c.riskSegments = [...warnings, ...c.riskSegments];
      });

      // Cards backed by logged data or OpenStreetMap rank by score; a route
      // with neither ranks after them, and ties fall back to the shorter walk.
      const isMeasured = (c: RouteCard) => !c.insufficientData || c.osmChecked;
      cards.sort((a, b) => {
        if (isMeasured(a) !== isMeasured(b)) return isMeasured(a) ? -1 : 1;
        if (isMeasured(a) && b.safetyScore !== a.safetyScore) {
          return b.safetyScore - a.safetyScore;
        }
        return a.distanceMeters - b.distanceMeters;
      });

      const shortestId = cards.reduce((m, c) =>
        c.distanceMeters < m.distanceMeters ? c : m,
      ).id;
      cards.forEach((c, i) => {
        if (i === 0) {
          c.tag = c.insufficientData
            ? c.osmChecked
              ? "Best estimated score"
              : "Shortest · limited safety data"
            : "Highest safety score";
        } else {
          c.tag = c.id === shortestId ? "Shortest" : "Alternate";
        }
      });

      setRoutes(cards);
      setActiveRouteId(cards[0].id);

      if (cards.length === 1) {
        setMapError(
          "Only one distinct walking path was found between these points — showing a single verified route rather than fabricated alternatives.",
        );
      } else if (osmFailures > 0) {
        setMapError(
          "OpenStreetMap data could not be loaded for some routes right now — scores marked “Est.” are cautious defaults. Try Re-calculate in a moment.",
        );
      }
    } catch (e) {
      console.error(e);
      setMapError(
        "Something went wrong fetching live map data. Please try again.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateRoutes = async () => {
    setMapError(null);
    let originPlace = originCoords;
    let destinationPlace = destinationCoords;

    if (!originPlace || originPlace.displayName !== origin) {
      originPlace = await geocodePlace(origin, { countryCode: "in" });
    }
    if (!destinationPlace || destinationPlace.displayName !== destination) {
      destinationPlace = await geocodePlace(destination, {
        countryCode: "in",
      });
    }

    if (!originPlace || !destinationPlace) {
      setMapError(
        "Could not find one of those locations. Try a more specific address.",
      );
      return;
    }

    await runRouteGeneration(originPlace, destinationPlace);
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) {
      setMapError("Geolocation is not supported by this browser.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;

        setOrigin(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        setOriginCoords({
          lat: latitude,
          lng: longitude,
          displayName: "Current Location",
        });

        fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`,
        )
          .then((res) => res.json())
          .then((data) => {
            if (data?.display_name) {
              setOrigin(data.display_name);
              setOriginCoords({
                lat: latitude,
                lng: longitude,
                displayName: data.display_name,
              });
            }
          })
          .catch((err) => {
            console.error("Reverse geocode failed:", err);
          });
      },
      (err) => {
        console.error("Geolocation error:", err.code, err.message);
        setMapError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied. Allow it in your browser's site settings."
            : "Could not access your location. Make sure GPS/location services are on.",
        );
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  useEffect(() => {
    if (!navigator.geolocation) {
      setOrigin("Connaught Place, New Delhi, India");
      setOriginReady(true);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setOrigin(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        setOriginCoords({ lat: latitude, lng: longitude, displayName: "Current Location" });
        setOriginReady(true);

        fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`)
          .then((res) => res.json())
          .then((data) => {
            if (data?.display_name) {
              setOrigin(data.display_name);
              setOriginCoords({ lat: latitude, lng: longitude, displayName: data.display_name });
            }
          })
          .catch(() => {
          });
      },
      (err) => {
        console.warn("Geolocation unavailable, using fallback:", err.message);
        setOrigin("Connaught Place, New Delhi, India");
        setOriginReady(true);
      },
      { enableHighAccuracy: true, timeout: 8000 },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedLocationTarget || !originReady) return;
    if (lastAutoRoutedTargetId.current === selectedLocationTarget.id) return;
    lastAutoRoutedTargetId.current = selectedLocationTarget.id;

    setDestination(selectedLocationTarget.name);

    const destinationPlace: GeocodedPlace = {
      lat: selectedLocationTarget.lat,
      lng: selectedLocationTarget.lng,
      displayName: selectedLocationTarget.name,
    };

    (async () => {
      let resolvedOrigin = originCoords;
      if (!resolvedOrigin) {
        resolvedOrigin = await geocodePlace(origin, { countryCode: "in" });
      }
      if (!resolvedOrigin) {
        setMapError(
          "Could not detect your starting location automatically. Set it manually above and click Re-calculate.",
        );
        return;
      }
      await runRouteGeneration(resolvedOrigin, destinationPlace);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocationTarget, originReady]);

  const selectedRoute = routes.find((r) => r.id === activeRouteId) || routes[0];

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#EFE6E1] rounded-[24px] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[#EFE6E1] pb-4">
          <div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#FFF0F3] text-[#A70F43] border border-[#EFE6E1]">
              Dynamic Navigation Engine
            </span>
            <h2 className="text-2xl font-bold text-[#221F20] tracking-tight mt-1.5 flex items-center gap-2">
              <Navigation className="w-5 h-5 text-[#A70F43]" />
              Dynamic Safest Route Generator
            </h2>
          </div>

          <button
            onClick={handleGenerateRoutes}
            disabled={isLoading}
            className="px-5 py-2.5 rounded-full bg-[#A70F43] hover:bg-[#8D0D39] text-white font-semibold text-xs shadow-sm flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4 text-white" />
            <span>
              {isLoading
                ? "Calculating FIR Maps..."
                : "Re-calculate Safest Routes"}
            </span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="block text-[#6E676A] mb-1.5 font-medium">
              Start Location
            </label>
            <div className="relative">
              <MapPin className="w-4 h-4 absolute left-3.5 top-3 text-[#A70F43]" />
              <PlaceAutocomplete
                value={origin}
                onChange={setOrigin}
                onSelect={(place) => setOriginCoords(place)}
                placeholder="Detecting your location..."
              />
            </div>
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              className="text-[11px] text-[#A70F43] font-semibold mt-1.5 hover:underline"
            >
              📍 Use my current location
            </button>
          </div>

          <div>
            <label className="block text-[#6E676A] mb-1.5 font-medium">
              Destination
            </label>
            <div className="relative">
              <PlaceAutocomplete
                value={destination}
                onChange={setDestination}
                onSelect={(place) => setDestinationCoords(place)}
                placeholder="Where are you headed?"
              />
            </div>
          </div>

          <div>
            <label className="block text-[#6E676A] mb-1.5 font-medium">
              Time Context
            </label>
            <select
              value={timeOfDay}
              onChange={(e: any) => setTimeOfDay(e.target.value)}
              className="w-full bg-[#FEFCFA] border border-[#EFE6E1] rounded-full px-4 py-2.5 text-[#221F20] focus:outline-none focus:border-[#A70F43]"
            >
              <option value="Day">Daylight (High Traffic)</option>
              <option value="Evening">Evening / Dusk</option>
              <option value="Late Night">Late Night (00:00 - 05:00)</option>
            </select>
          </div>

          <div>
            <label className="block text-[#6E676A] mb-1.5 font-medium">
              Travel Mode
            </label>
            <select
              value={transportMode}
              onChange={(e: any) => setTransportMode(e.target.value)}
              className="w-full bg-[#FEFCFA] border border-[#EFE6E1] rounded-full px-4 py-2.5 text-[#221F20] focus:outline-none focus:border-[#A70F43]"
            >
              <option value="Walking">Walking (Solo / Group)</option>
              <option value="Wheelchair / Assistive">
                Wheelchair / Senior Walker
              </option>
              <option value="Solo Transit">E-Rickshaw / Night Bus</option>
            </select>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs pt-1 overflow-x-auto no-scrollbar">
          <span className="text-[#6E676A] font-medium whitespace-nowrap">
            Quick Target:
          </span>
          {locations.map((loc) => (
            <button
              key={loc.id}
              onClick={() => setDestination(loc.name)}
              className="px-3 py-1.5 rounded-full bg-[#FEFCFA] hover:bg-[#FFF0F3] text-[#221F20] whitespace-nowrap transition-colors border border-[#EFE6E1]"
            >
              {loc.name.split(" ")[0]}...
            </button>
          ))}
        </div>
      </div>

      {mapError && (
        <div className="flex items-start gap-2 p-4 rounded-[18px] bg-amber-50 border border-amber-200 text-amber-800 text-xs">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{mapError}</span>
        </div>
      )}

      {originCoords && destinationCoords && (
        <div className="bg-white border border-[#EFE6E1] rounded-[24px] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-[#221F20] flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#A70F43]" />
              Live Route Map
            </h3>
            <span className="text-[11px] text-[#6E676A]">
              OpenStreetMap + OSRM (real routing data) · Safety scoring from
              OpenStreetMap, logged locations and community reports
            </span>
          </div>
          <LiveRouteMap
            origin={{ lat: originCoords.lat, lng: originCoords.lng }}
            destination={{
              lat: destinationCoords.lat,
              lng: destinationCoords.lng,
            }}
            path={selectedRoute?.path ?? []}
          />
        </div>
      )}

      {selectedRoute && selectedRoute.steps.length > 0 && (
        <div className="bg-white border border-[#EFE6E1] rounded-[24px] p-6 shadow-[0_4px_20px_rgba(0,0,0,0.03)] space-y-3">
          <h3 className="text-base font-bold text-[#221F20] flex items-center gap-2">
            <Navigation className="w-4 h-4 text-[#A70F43]" />
            Directions · {selectedRoute.name}
          </h3>
          <ol className="space-y-2 text-xs text-[#221F20]">
            {selectedRoute.steps.map((s, i) => (
              <li
                key={i}
                className="flex justify-between gap-3 border-b border-[#EFE6E1] pb-2 last:border-b-0"
              >
                <span>
                  {i + 1}. {s.instruction}
                </span>
                <span className="text-[#6E676A] whitespace-nowrap">
                  {formatDistance(s.distanceMeters)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {routes.length === 0 ? (
        <div className="bg-white border border-dashed border-[#EFE6E1] rounded-[24px] p-10 text-center space-y-2">
          <Navigation className="w-6 h-6 text-[#A70F43] mx-auto" />
          <p className="text-sm font-semibold text-[#221F20]">
            No route generated yet
          </p>
          <p className="text-xs text-[#6E676A]">
            Enter a start and destination above, then click "Re-calculate Safest
            Routes" to see live options.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {routes.map((route) => {
              const isSelected = route.id === activeRouteId;
              const isHighSafety = !route.insufficientData && route.safetyScore >= 90;
              const showBars = route.lightingKnown || route.accessibilityKnown;

              return (
                <div
                  key={route.id}
                  onClick={() => setActiveRouteId(route.id)}
                  className={`cursor-pointer rounded-[24px] p-5 border transition-all relative flex flex-col justify-between space-y-4 ${
                    isSelected
                      ? "bg-white border-[#A70F43] ring-2 ring-[#FFF0F3] shadow-[0_4px_20px_rgba(167,15,67,0.06)]"
                      : "bg-white border-[#EFE6E1] hover:border-[#A70F43]"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="text-[11px] font-medium px-3 py-0.5 rounded-full bg-[#FFF0F3] text-[#A70F43] border border-[#EFE6E1]">
                        {route.tag}
                      </span>
                      <div
                        className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          isHighSafety
                            ? "bg-[#FFF0F3] text-[#A70F43] border border-[#EFE6E1]"
                            : "bg-amber-50 text-amber-800 border border-amber-200"
                        }`}
                      >
                        {route.insufficientData
                          ? `Est. ${route.safetyScore}/100`
                          : `Safety ${route.safetyScore}/100`}
                      </div>
                    </div>

                    <h3 className="text-[18px] font-semibold text-[#221F20] mb-1.5">
                      {route.name}
                    </h3>

                    <div className="flex items-center space-x-3 text-xs text-[#6E676A] mb-4">
                      <span className="flex items-center space-x-1">
                        <Footprints className="w-3.5 h-3.5 text-[#A70F43]" />
                        <span>{route.distance}</span>
                      </span>
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5 text-[#A70F43]" />
                        <span>{route.estimatedTime}</span>
                      </span>
                    </div>

                    {showBars && (
                      <div className="space-y-2.5 text-xs">
                        {route.lightingKnown && (
                          <div>
                            <div className="flex justify-between text-[11px] text-[#6E676A] mb-1">
                              <span>Lighting Coverage</span>
                              <span className="text-[#A70F43] font-bold">
                                {route.lightingPercent}%
                              </span>
                            </div>
                            <div className="w-full bg-[#FEFCFA] border border-[#EFE6E1] h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-[#A70F43] h-full rounded-full transition-all"
                                style={{ width: `${route.lightingPercent}%` }}
                              ></div>
                            </div>
                          </div>
                        )}

                        {route.accessibilityKnown && (
                          <div>
                            <div className="flex justify-between text-[11px] text-[#6E676A] mb-1">
                              <span>Step-Free Accessibility</span>
                              <span className="text-[#221F20] font-bold">
                                {route.accessibilityScore}%
                              </span>
                            </div>
                            <div className="w-full bg-[#FEFCFA] border border-[#EFE6E1] h-2 rounded-full overflow-hidden">
                              <div
                                className="bg-[#5FA777] h-full rounded-full transition-all"
                                style={{ width: `${route.accessibilityScore}%` }}
                              ></div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {!route.lightingKnown && (
                      <p className="mt-3 text-[11px] text-[#6E676A]">
                        Streetlight coverage isn’t mapped for this area yet.
                      </p>
                    )}

                    <div className="mt-4 space-y-1.5 text-xs text-[#221F20]">
                      <span className="text-[11px] font-semibold text-[#6E676A]">
                        Safety Features:
                      </span>
                      {route.highlights.length > 0 ? (
                        route.highlights.map((h, idx) => (
                          <div
                            key={idx}
                            className="flex items-start gap-1.5 text-[#221F20]"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#5FA777]" />
                            <span>{h}</span>
                          </div>
                        ))
                      ) : (
                        <p className="text-[11px] text-[#6E676A]">
                          No safety features found near this route.
                        </p>
                      )}
                    </div>

                    {route.riskSegments && route.riskSegments.length > 0 && (
                      <div className="mt-4 p-3 rounded-[16px] bg-amber-50/80 border border-amber-200 space-y-1 text-xs">
                        <span className="font-semibold text-amber-800 flex items-center gap-1 text-[11px]">
                          <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                          Things to know:
                        </span>
                        {route.riskSegments.map((r, idx) => (
                          <p key={idx} className="text-amber-800 text-[11px]">
                            • {r}
                          </p>
                        ))}
                      </div>
                    )}

                    <p className="mt-3 text-[10px] text-[#6E676A]">
                      {route.osmChecked
                        ? "Checked against OpenStreetMap"
                        : "OpenStreetMap data unavailable"}
                      {" · "}logged safety data near {route.dataCoverage}% of route
                    </p>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveRouteId(route.id);
                      onStartNavigation(route);
                    }}
                    className={`w-full py-2.5 rounded-full font-semibold text-xs transition-all flex items-center justify-center gap-2 ${
                      isSelected
                        ? "bg-[#A70F43] hover:bg-[#8D0D39] text-white shadow-xs"
                        : "bg-[#FEFCFA] hover:bg-[#FFF0F3] text-[#221F20] border border-[#EFE6E1]"
                    }`}
                  >
                    <span>
                      {isSelected ? "Navigating..." : "Start Navigation"}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              );
            })}
          </div>

          {routes.some((r) => r.insufficientData) && (
            <p className="text-[11px] text-[#6E676A] text-center">
              “Est.” scores are estimated from OpenStreetMap road types, nearby public
              places and police stations. They become measured scores as more
              locations and community reports are logged along the route.
            </p>
          )}
        </>
      )}
    </div>
  );
};