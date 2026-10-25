import React, { useState, useEffect, useRef } from "react";

import { RouteOption, SafetyLocation } from "../types";
import { GuardIaLogo } from "./GuardIaLogo";
import { LiveRouteMap } from "./LiveRouteMap";
import { geocodePlace, GeocodedPlace } from "../lib/geocode";
import { PlaceAutocomplete } from "./PlaceAutocomplete";
import {
  getWalkingRoute,
  formatDistance,
  formatDuration,
  LatLng,
  RouteStep,
} from "../lib/routing";
import { scoreRoutePath, TimeOfDay as GridTimeOfDay } from "../utils/hotspot";
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
  const [accessibilityNeeds, setAccessibilityNeeds] = useState(
    "Step-free & Well-Lit",
  );

  const [isLoading, setIsLoading] = useState(false);
  const [routes, setRoutes] = useState<RouteOption[]>([]);

  const [activeRouteId, setActiveRouteId] = useState<string>("route-safest");
  const [originCoords, setOriginCoords] = useState<GeocodedPlace | null>(null);
  const [destinationCoords, setDestinationCoords] =
    useState<GeocodedPlace | null>(null);
  const [routePath, setRoutePath] = useState<LatLng[]>([]);
  const [routeSteps, setRouteSteps] = useState<RouteStep[]>([]);
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

      const realRoutes = await getWalkingRoute(
        { lat: originPlace.lat, lng: originPlace.lng },
        { lat: destinationPlace.lat, lng: destinationPlace.lng },
        { alternatives: true },
      );
      const primaryRoute = realRoutes[0];
      setRoutePath(primaryRoute.coordinates);
      setRouteSteps(primaryRoute.steps);
      console.log(
        `OSRM found ${realRoutes.length} distinct route(s) for this trip.`,
      );

      const res = await fetch("/api/ai/analyze-route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          origin: originPlace.displayName,
          destination: destinationPlace.displayName,
          timeOfDay,
          transportMode,
          accessibilityNeeds,
        }),
      });
      const data = await res.json();

      const gridTimeOfDay: GridTimeOfDay =
        timeOfDay === "Evening"
          ? "Dusk"
          : timeOfDay === "Late Night"
          ? "Late Night"
          : timeOfDay === "Day"
          ? "Day"
          : "Night";

      const assessedRoutes = realRoutes.map((r) =>
        scoreRoutePath(r.coordinates, locations, reports, gridTimeOfDay),
      );

      if (data.routes && Array.isArray(data.routes) && data.routes.length > 0) {
        const usableCount = Math.min(data.routes.length, realRoutes.length);
        const updatedRoutes: RouteOption[] = data.routes
          .slice(0, usableCount)
          .map((r: RouteOption, idx: number) => {
            const assessment = assessedRoutes[idx];
            return {
              ...r,
              distance: formatDistance(realRoutes[idx].distanceMeters),
              estimatedTime: formatDuration(realRoutes[idx].durationSeconds),
              safetyScore: assessment.pathSafetyScore,
              lightingPercent: assessment.lightingPercent,
              accessibilityScore: assessment.accessibilityPercent,
              riskSegments: assessment.riskSegments.length > 0 ? assessment.riskSegments : [],
              highlights: assessment.policeBoothNearby
                ? [...r.highlights, "Passes within 400m of an active police booth"]
                : r.highlights,
            };
          })
          .sort((a, b) => b.safetyScore - a.safetyScore);
        setRoutes(updatedRoutes);
        setActiveRouteId(updatedRoutes[0].id);

        if (updatedRoutes.length === 1) {
          setMapError(
            "Only one distinct walking path was found between these points — showing a single verified route rather than fabricated alternatives.",
          );
        }
      } else if (realRoutes.length > 0) {
        const synthesizedRoutes: RouteOption[] = realRoutes
          .map((r, idx) => {
            const assessment = assessedRoutes[idx];
            const rank = [...assessedRoutes]
              .sort((a, b) => b.pathSafetyScore - a.pathSafetyScore)
              .indexOf(assessment);
            return {
              id: `route-computed-${idx}`,
              name: rank === 0 ? "Recommended Safe Route" : `Alternate Route ${idx + 1}`,
              tag: rank === 0 ? "Safest (computed)" : "Alternate (computed)",
              distance: formatDistance(r.distanceMeters),
              estimatedTime: formatDuration(r.durationSeconds),
              safetyScore: assessment.pathSafetyScore,
              lightingPercent: assessment.lightingPercent,
              accessibilityScore: assessment.accessibilityPercent,
              cctvCoverage: assessment.cctvPercent,
              policeBoothNearby: assessment.policeBoothNearby,
              highlights: [
                `${assessment.cctvPercent}% average CCTV coverage along this path`,
                assessment.policeBoothNearby
                  ? "Passes within 400m of an active police booth"
                  : "No police booth directly on this path",
              ],
              riskSegments: assessment.riskSegments,
            };
          })
          .sort((a, b) => b.safetyScore - a.safetyScore);

        setRoutes(synthesizedRoutes);
        setActiveRouteId(synthesizedRoutes[0].id);
        setMapError(
          "Live AI descriptions are unavailable right now — safety scores below are computed directly from real location and report data instead.",
        );
      } else {
        setMapError(
          "Live route map loaded, but no route options could be generated. Try again in a moment.",
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
              OpenStreetMap + OSRM (real routing data) · Safety scoring via
              Gemini AI + community reports
            </span>
          </div>
          <LiveRouteMap
            origin={{ lat: originCoords.lat, lng: originCoords.lng }}
            destination={{
              lat: destinationCoords.lat,
              lng: destinationCoords.lng,
            }}
            path={routePath}
          />
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {routes.map((route) => {
            const isSelected = route.id === activeRouteId;
            const isHighSafety = route.safetyScore >= 90;

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
                      Safety {route.safetyScore}/100
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

                  <div className="space-y-2.5 text-xs">
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
                  </div>

                  <div className="mt-4 space-y-1.5 text-xs text-[#221F20]">
                    <span className="text-[11px] font-semibold text-[#6E676A]">
                      Safety Features:
                    </span>
                    {route.highlights.map((h, idx) => (
                      <div
                        key={idx}
                        className="flex items-start gap-1.5 text-[#221F20]"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-[#5FA777]" />
                        <span>{h}</span>
                      </div>
                    ))}
                  </div>

                  {route.riskSegments && route.riskSegments.length > 0 && (
                    <div className="mt-4 p-3 rounded-[16px] bg-amber-50/80 border border-amber-200 space-y-1 text-xs">
                      <span className="font-semibold text-amber-800 flex items-center gap-1 text-[11px]">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                        Segment Warning:
                      </span>
                      {route.riskSegments.map((r, idx) => (
                        <p key={idx} className="text-amber-800 text-[11px]">
                          • {r}
                        </p>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
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
      )}
    </div>
  );
};