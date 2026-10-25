export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteStep {
  instruction: string;
  distanceMeters: number;
}


export interface RoutedPath {
  coordinates: LatLng[];
  distanceMeters: number;
  durationSeconds: number;
  steps: RouteStep[];
}

const OSRM_BASE = 'https://router.project-osrm.org/route/v1/foot';

export async function getWalkingRoute(
  origin: LatLng,
  destination: LatLng,
  opts?: { alternatives?: boolean }
): Promise<RoutedPath[]> {
  const coords = `${origin.lng},${origin.lat};${destination.lng},${destination.lat}`;
  const params = new URLSearchParams({
    geometries: 'geojson',
    overview: 'full',
    steps: 'true',
    alternatives: opts?.alternatives ? 'true' : 'false',
  });

  const res = await fetch(`${OSRM_BASE}/${coords}?${params.toString()}`);
  if (!res.ok) throw new Error(`Routing failed: ${res.status}`);

  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(`No route found: ${data.code || 'unknown error'}`);
  }

  return data.routes.map((route: any) => ({
    coordinates: route.geometry.coordinates.map(([lng, lat]: [number, number]) => ({ lat, lng })),
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    steps: route.legs.flatMap((leg: any) =>
      leg.steps.map((s: any) => ({
        instruction: formatOsrmInstruction(s),
        distanceMeters: s.distance,
      }))
    ),
  }));
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
