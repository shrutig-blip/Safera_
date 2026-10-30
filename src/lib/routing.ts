export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
  /** Raw road name from OSRM (may be empty for unnamed footpaths). */
  roadName?: string;
}

export interface RoutedPath {
  coordinates: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteStep[];
  /** Short label built from the roads this path spends the most distance on, e.g. "GT Road & Yudhishthir Setu". */
  viaLabel?: string;
}

// The public router.project-osrm.org server only runs the DRIVING profile
// (it silently ignores "/foot/"), which is why an 8 km walk showed "9 mins".
// This FOSSGIS endpoint runs a real pedestrian profile.
const OSRM_BASE = 'https://routing.openstreetmap.de/routed-foot/route/v1/foot';

// ~4.9 km/h. Guard so a duration can never be faster than walking pace.
const WALKING_SPEED_MPS = 1.35;

function parseRoutes(data: any): RoutedPath[] {
  return data.routes.map((route: any) => {
    const steps: RouteStep[] = route.legs.flatMap((leg: any) =>
      leg.steps.map((s: any) => ({
        instruction: formatOsrmInstruction(s),
        distanceMeters: s.distance,
        roadName: s.name || '',
      }))
    );

    return {
      coordinates: route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng })),
      distanceMeters: route.distance,
      durationSeconds: Math.max(route.duration, route.distance / WALKING_SPEED_MPS),
      steps,
      viaLabel: buildViaLabel(steps),
    };
  });
}

async function requestRoutes(points: LatLng[], alternatives: boolean): Promise<RoutedPath[]> {
  const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
  const params = new URLSearchParams({
    geometries: 'geojson',
    overview: 'full',
    steps: 'true',
    alternatives: alternatives ? 'true' : 'false',
  });

  const res = await fetch(`${OSRM_BASE}/${coords}?${params.toString()}`);
  if (!res.ok) throw new Error(`Routing failed: ${res.status}`);

  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(`No route found: ${data.code || 'unknown error'}`);
  }
  return parseRoutes(data);
}

export async function getWalkingRoute(
  origin: LatLng,
  destination: LatLng,
  opts?: { alternatives?: boolean }
): Promise<RoutedPath[]> {
  return requestRoutes([origin, destination], !!opts?.alternatives);
}

// ---------------------------------------------------------------------------
// Multiple genuinely different walking routes
// ---------------------------------------------------------------------------

const toRad = (d: number) => (d * Math.PI) / 180;

function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Fraction of A's (sampled) points that lie within 80 m of path B. */
function overlapFraction(a: LatLng[], b: LatLng[]): number {
  const sampleA = a.filter((_, i) => i % 10 === 0);
  const sampleB = b.filter((_, i) => i % 3 === 0);
  if (sampleA.length === 0) return 1;
  const near = sampleA.filter((p) => sampleB.some((q) => distanceMeters(p, q) < 80)).length;
  return near / sampleA.length;
}

/**
 * OSRM's `alternatives=true` returns at most one alternative, and often none.
 * To surface different corridors we also ask for routes via a point offset to
 * each side of the straight line, then keep only routes that are genuinely
 * different: not a big detour, not mostly the same streets, and not the same
 * set of main roads in a different order.
 */
export async function getWalkingRoutes(
  origin: LatLng,
  destination: LatLng,
  maxRoutes = 3
): Promise<RoutedPath[]> {
  const candidates = await requestRoutes([origin, destination], true); // throws if no route at all

  if (candidates.length < maxRoutes) {
    const dLat = destination.lat - origin.lat;
    const dLng = destination.lng - origin.lng;
    const mid = { lat: (origin.lat + destination.lat) / 2, lng: (origin.lng + destination.lng) / 2 };

    const viaRequests = [0.2, -0.2, 0.35, -0.35].map((k) => {
      const via: LatLng = { lat: mid.lat + dLng * k, lng: mid.lng - dLat * k };
      return requestRoutes([origin, via, destination], false).catch(() => [] as RoutedPath[]);
    });
    const viaResults = await Promise.all(viaRequests);
    viaResults.forEach((r) => candidates.push(...r));
  }

  const shortest = Math.min(...candidates.map((r) => r.distanceMeters));
  const unique: RoutedPath[] = [];
  const seenRoadSets = new Set<string>();

  for (const route of [...candidates].sort((a, b) => a.distanceMeters - b.distanceMeters)) {
    if (route.distanceMeters > shortest * 1.35) continue; // not a sensible alternative

    // same main roads in any order = the same route
    const roadSet = (route.viaLabel ?? '').split(' & ').map((s) => s.trim()).sort().join('|');
    if (roadSet && seenRoadSets.has(roadSet)) continue;

    // mostly the same streets as one we already kept
    if (unique.some((u) => overlapFraction(route.coordinates, u.coordinates) > 0.6)) continue;

    unique.push(route);
    if (roadSet) seenRoadSets.add(roadSet);
    if (unique.length >= maxRoutes) break;
  }

  return unique;
}

function buildViaLabel(steps: RouteStep[]): string {
  const byRoad = new Map<string, number>();
  for (const s of steps) {
    if (!s.roadName) continue;
    byRoad.set(s.roadName, (byRoad.get(s.roadName) || 0) + s.distanceMeters);
  }
  const top = [...byRoad.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([name]) => name);
  return top.length > 0 ? top.join(' & ') : 'local roads';
}

// OSRM gives structured maneuver data, not plain English — this turns it
// into a readable line like "Turn left onto Wazirabad Road".
function formatOsrmInstruction(step: any): string {
  const type = step.maneuver.type;
  const modifier = step.maneuver.modifier;
  const road = step.name || 'the road';

  if (type === 'depart') return `Head ${modifier || 'forward'} on ${road}`;
  if (type === 'arrive') return `Arrive at your destination`;
  if (type === 'turn') return `Turn ${modifier} onto ${road}`;
  if (type === 'new name') return `Continue onto ${road}`;
  if (type === 'roundabout') return `At the roundabout, take the exit onto ${road}`;
  return `Continue on ${road}`;
}

export function formatDistance(meters: number): string {
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
}

export function formatDuration(seconds: number): string {
  const mins = Math.round(seconds / 60);
  return `${mins} min${mins === 1 ? '' : 's'}`;
}