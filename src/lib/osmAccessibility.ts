/**
 * osmAccessibility.ts
 *
 * Fetches REAL nearby places and their real accessibility tags from
 * OpenStreetMap via the Overpass API — no API key required, matching the
 * same free/no-key pattern this repo already uses for Nominatim
 * (geocode.ts) and Open-Meteo (SafetyMap.tsx).
 *
 * IMPORTANT HONESTY NOTE: OpenStreetMap is crowd-mapped. A missing tag
 * does NOT mean a feature is absent — it means nobody has recorded it
 * yet. Every boolean field below is `true | false | undefined`, where
 * `undefined` means "not mapped," not "not present." Callers must not
 * collapse `undefined` into `false` — that would misrepresent real
 * unmapped data as a confirmed negative.
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

export interface AccessiblePlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  amenityType: string; // raw OSM amenity/shop/leisure/tourism/railway value, e.g. "hospital", "cafe"
  accessibility: {
    wheelchairRamps: boolean | undefined;
    stepFreeEntrances: boolean | undefined;
    cctvCoverage: boolean | undefined;
    goodStreetlights: boolean | undefined;
    accessiblePublicWashrooms: boolean | undefined;
    policeBooths: boolean | undefined;
    phoneBooths: boolean | undefined;
    brailleSignage: boolean | undefined;
    tactilePaving: boolean | undefined;
  };
  nearestPoliceDistanceMeters: number | null;
}

interface OverpassElement {
  type: 'node' | 'way';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function elementCoords(el: OverpassElement): { lat: number; lng: number } | null {
  if (typeof el.lat === 'number' && typeof el.lon === 'number') return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  return null;
}

/** Maps a raw OSM tag value ('yes'/'no'/'limited'/anything else) to a real tri-state. */
function tagToTriState(value: string | undefined): boolean | undefined {
  if (value === 'yes' || value === 'limited') return true;
  if (value === 'no') return false;
  return undefined; // not mapped
}

/**
 * Fetches real nearby places (within `radiusMeters`) that have a name and
 * belong to an accessibility-relevant category, along with their real OSM
 * accessibility tags. Also fetches nearby police/toilet/surveillance/phone
 * nodes (even unnamed ones) so per-place proximity can be computed.
 */
export async function fetchNearbyAccessiblePlaces(
  lat: number,
  lng: number,
  radiusMeters = 2000,
  limit = 40,
  timeoutMs = 12000
): Promise<AccessiblePlace[]> {
  const query = `
    [out:json][timeout:20];
    (
      node(around:${radiusMeters},${lat},${lng})["name"]["amenity"];
      way(around:${radiusMeters},${lat},${lng})["name"]["amenity"];
      node(around:${radiusMeters},${lat},${lng})["name"]["shop"];
      node(around:${radiusMeters},${lat},${lng})["name"]["leisure"];
      node(around:${radiusMeters},${lat},${lng})["name"]["tourism"];
      node(around:${radiusMeters},${lat},${lng})["railway"="station"]["name"];
      node(around:${radiusMeters},${lat},${lng})["amenity"="police"];
      node(around:${radiusMeters},${lat},${lng})["amenity"="toilets"];
      node(around:${radiusMeters},${lat},${lng})["amenity"="telephone"];
      node(around:${radiusMeters},${lat},${lng})["man_made"="surveillance"];
    );
    out center tags ${limit * 2};
  `;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: query,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
  if (!res.ok) throw new Error(`Overpass API responded ${res.status}`);

  const data = await res.json();
  const elements: OverpassElement[] = Array.isArray(data?.elements) ? data.elements : [];

  const policeNodes = elements.filter((el) => el.tags?.amenity === 'police');
  const toiletNodes = elements.filter((el) => el.tags?.amenity === 'toilets');
  const phoneNodes = elements.filter((el) => el.tags?.amenity === 'telephone');
  const surveillanceNodes = elements.filter((el) => el.tags?.man_made === 'surveillance');

  const namedPlaces = elements.filter((el) => el.tags?.name);

  const NEARBY_RADIUS = 350; // meters — "is this feature basically at/near this place"

  const results: AccessiblePlace[] = [];

  for (const el of namedPlaces.slice(0, limit)) {
    const coords = elementCoords(el);
    if (!coords) continue;
    const tags = el.tags || {};

    const nearestPolice = policeNodes
      .map((p) => {
        const pc = elementCoords(p);
        return pc ? haversineMeters(coords.lat, coords.lng, pc.lat, pc.lng) : Infinity;
      })
      .reduce((min, d) => Math.min(min, d), Infinity);

    const hasNearbyAccessibleToilet = toiletNodes.some((t) => {
      const tc = elementCoords(t);
      if (!tc) return false;
      return (
        haversineMeters(coords.lat, coords.lng, tc.lat, tc.lng) <= NEARBY_RADIUS &&
        (t.tags?.wheelchair === 'yes' || tags.amenity === 'toilets')
      );
    });
    const hasAnyNearbyToilet = toiletNodes.some((t) => {
      const tc = elementCoords(t);
      return tc ? haversineMeters(coords.lat, coords.lng, tc.lat, tc.lng) <= NEARBY_RADIUS : false;
    });

    const hasNearbyPhone = phoneNodes.some((p) => {
      const pc = elementCoords(p);
      return pc ? haversineMeters(coords.lat, coords.lng, pc.lat, pc.lng) <= NEARBY_RADIUS : false;
    });

    const hasNearbySurveillance = surveillanceNodes.some((s) => {
      const sc = elementCoords(s);
      return sc ? haversineMeters(coords.lat, coords.lng, sc.lat, sc.lng) <= NEARBY_RADIUS : false;
    });

    results.push({
      id: `osm-${el.type}-${el.id}`,
      name: tags.name,
      lat: coords.lat,
      lng: coords.lng,
      amenityType: tags.amenity || tags.shop || tags.leisure || tags.tourism || tags.railway || 'place',
      accessibility: {
        wheelchairRamps: tagToTriState(tags.wheelchair),
        stepFreeEntrances: tags.wheelchair === 'yes' ? true : tagToTriState(tags.wheelchair),
        cctvCoverage: hasNearbySurveillance ? true : undefined,
        goodStreetlights: tagToTriState(tags.lit),
        accessiblePublicWashrooms: hasNearbyAccessibleToilet
          ? true
          : hasAnyNearbyToilet
          ? false
          : undefined,
        policeBooths: nearestPolice <= NEARBY_RADIUS ? true : undefined,
        phoneBooths: hasNearbyPhone ? true : undefined,
        brailleSignage: tagToTriState(tags['tactile_writing:braille']),
        tactilePaving: tagToTriState(tags.tactile_paving),
      },
      nearestPoliceDistanceMeters: Number.isFinite(nearestPolice) ? Math.round(nearestPolice) : null,
    });
  }

  return results;
}
