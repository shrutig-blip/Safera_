import { SafetyLocation } from '../types';
import { haversineDistanceMeters } from './hotspot';

export type OverpassPlaceType =
  | 'police'
  | 'hospital'
  | 'pharmacy'
  | 'fire_station'
  | 'marketplace'
  | 'community_centre'
  | 'civic_building';

export interface OverpassPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  type: OverpassPlaceType;
  distanceMeters: number;
}

export interface NearbyPlacesResult {
  places: OverpassPlace[];
  status: 'live' | 'timeout' | 'network-blocked' | 'rate-limited' | 'empty';
}

// Two public mirrors — if the primary is congested or rate-limits us, retry
// once against the second before giving up and falling back to seed data.
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

function buildQuery(lat: number, lng: number, radiusMeters: number): string {
  // Single combined query (not one-per-category) — public Overpass instances
  // rate-limit concurrent connections hard (2 slots on the free tier), so
  // one request beats several every time. Covers: police, hospitals,
  // pharmacies, fire stations, markets ("famous market"), community/help
  // centres, and civic buildings (government offices, town halls — real,
  // staffed public places, used as a "safe location" proxy since OSM has
  // no literal safe-zone tag).
  return `
    [out:json][timeout:20];
    (
      node["amenity"="police"](around:${radiusMeters},${lat},${lng});
      node["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
      way["amenity"="hospital"](around:${radiusMeters},${lat},${lng});
      node["amenity"="pharmacy"](around:${radiusMeters},${lat},${lng});
      node["amenity"="fire_station"](around:${radiusMeters},${lat},${lng});
      node["shop"="marketplace"](around:${radiusMeters},${lat},${lng});
      node["amenity"="marketplace"](around:${radiusMeters},${lat},${lng});
      way["amenity"="marketplace"](around:${radiusMeters},${lat},${lng});
      node["amenity"="community_centre"](around:${radiusMeters},${lat},${lng});
      node["amenity"="social_facility"](around:${radiusMeters},${lat},${lng});
      node["amenity"="townhall"](around:${radiusMeters},${lat},${lng});
      node["office"="government"](around:${radiusMeters},${lat},${lng});
    );
    out center 80;
  `;
}

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function elementToPlace(el: OverpassElement, userLat: number, userLng: number): OverpassPlace | null {
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (lat === undefined || lng === undefined || !el.tags) return null;

  const amenity = el.tags.amenity;
  const shop = el.tags.shop;
  const office = el.tags.office;

  const type: OverpassPlaceType | null =
    amenity === 'police' ? 'police'
    : amenity === 'hospital' ? 'hospital'
    : amenity === 'pharmacy' ? 'pharmacy'
    : amenity === 'fire_station' ? 'fire_station'
    : amenity === 'marketplace' || shop === 'marketplace' ? 'marketplace'
    : amenity === 'community_centre' || amenity === 'social_facility' ? 'community_centre'
    : amenity === 'townhall' || office === 'government' ? 'civic_building'
    : null;
  if (!type) return null;

  const fallbackName: Record<OverpassPlaceType, string> = {
    police: 'Police Station',
    hospital: 'Hospital',
    pharmacy: 'Pharmacy',
    fire_station: 'Fire Station',
    marketplace: 'Local Market',
    community_centre: 'Community / Help Centre',
    civic_building: 'Government Office',
  };

  return {
    id: `osm-${el.type}-${el.id}`,
    name: el.tags.name || fallbackName[type],
    lat,
    lng,
    type,
    distanceMeters: Math.round(haversineDistanceMeters(userLat, userLng, lat, lng)),
  };
}

async function queryOnce(
  endpoint: string,
  lat: number,
  lng: number,
  radiusMeters: number
): Promise<{ elements: OverpassElement[] } | 'timeout' | 'rate-limited' | 'network-blocked'> {
  try {
    const response = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: buildQuery(lat, lng, radiusMeters),
      },
      20000
    );

    if (response.status === 429) return 'rate-limited';
    if (!response.ok) return 'network-blocked';

    return await response.json();
  } catch (err) {
    const isAbort = err instanceof DOMException && err.name === 'AbortError';
    console.error(`Overpass fetch failed for ${endpoint}`, err);
    return isAbort ? 'timeout' : 'network-blocked';
  }
}

const PER_CATEGORY_CAP = 4; // e.g. up to 4 nearest police, 4 nearest markets, etc.
const MAX_TOTAL_PLACES = 24;

/**
 * Picks a diverse, category-balanced set of places instead of a pure
 * global nearest-N — otherwise one dense category (e.g. hospitals) can
 * crowd out everything else even when other categories genuinely exist
 * a bit farther out.
 */
function selectDiversePlaces(places: OverpassPlace[]): OverpassPlace[] {
  const byType = new Map<OverpassPlaceType, OverpassPlace[]>();
  for (const place of places) {
    const list = byType.get(place.type) ?? [];
    list.push(place);
    byType.set(place.type, list);
  }

  const picked: OverpassPlace[] = [];
  for (const list of byType.values()) {
    list.sort((a, b) => a.distanceMeters - b.distanceMeters);
    picked.push(...list.slice(0, PER_CATEGORY_CAP));
  }

  return picked.sort((a, b) => a.distanceMeters - b.distanceMeters).slice(0, MAX_TOTAL_PLACES);
}

/**
 * Fetches real police stations, hospitals, pharmacies, fire stations,
 * markets, and community/civic buildings within `radiusMeters` of a real
 * lat/lng from OpenStreetMap — no API key, no mock data. Tries the primary
 * Overpass mirror, then a second mirror on failure. If very few results
 * come back at all (a sign the radius is too tight for a sparsely-mapped
 * area), automatically retries once with a wider radius before giving up.
 */
export async function fetchNearbyPlaces(
  lat: number,
  lng: number,
  radiusMeters = 5000
): Promise<NearbyPlacesResult> {
  const tryRadius = async (radius: number): Promise<NearbyPlacesResult | null> => {
    for (const endpoint of OVERPASS_ENDPOINTS) {
      const result = await queryOnce(endpoint, lat, lng, radius);

      if (result === 'timeout' || result === 'network-blocked' || result === 'rate-limited') {
        continue; // try the next mirror
      }

      const rawPlaces = (result.elements || [])
        .map((el) => elementToPlace(el, lat, lng))
        .filter((p): p is OverpassPlace => p !== null);

      const places = selectDiversePlaces(rawPlaces);
      return { places, status: places.length > 0 ? 'live' : 'empty' };
    }
    return null; // both mirrors failed outright
  };

  const firstAttempt = await tryRadius(radiusMeters);
  if (!firstAttempt) return { places: [], status: 'network-blocked' };

  // Fewer than 5 total real places is a sign this specific radius is too
  // tight for how densely this area happens to be mapped — widen once
  // rather than showing an almost-empty grid.
  if (firstAttempt.places.length < 5 && radiusMeters < 12000) {
    const widerAttempt = await tryRadius(Math.max(radiusMeters * 2, 8000));
    if (widerAttempt && widerAttempt.places.length > firstAttempt.places.length) {
      return widerAttempt;
    }
  }

  return firstAttempt;
}

/**
 * Converts real OSM places into the app's existing SafetyLocation shape so
 * the Live Safety Grid, route scorer, and location cards all work unchanged
 * — but honestly: firCount/cctvPercent/trustScore/lightingStars are real
 * unknowns for these places (no public crime-data source exists), so they
 * stay at neutral placeholders instead of being invented. Only the
 * proximity-derived score, distance, and place identity are presented as
 * real numbers.
 */
export function placesToSafetyLocations(places: OverpassPlace[], userLat: number, userLng: number): SafetyLocation[] {
  const nearestPolice = places.filter((p) => p.type === 'police').sort((a, b) => a.distanceMeters - b.distanceMeters)[0];

  return places.map((place) => {
    // Honest, proximity-only scoring: a real staffed/public place nearby is
    // a genuine safety signal even without crime data — closer and more
    // "protective" or crowd-heavy place types score higher. This is NOT a
    // crime-risk prediction, just "how close is a real, real-world anchor point."
    const typeBaseline: Record<OverpassPlaceType, number> = {
      police: 88,
      fire_station: 82,
      hospital: 80,
      civic_building: 76,
      community_centre: 74,
      marketplace: 70, // busy/crowded public space — generally safer by presence of people
      pharmacy: 68,
    };
    const distancePenalty = Math.min(20, Math.round(place.distanceMeters / 250));
    const safetyScore = Math.max(40, typeBaseline[place.type] - distancePenalty);

    return {
      id: place.id,
      name: place.name,
      area: 'Near your current location',
      lat: place.lat,
      lng: place.lng,
      safetyScore,
      riskLevel: safetyScore >= 75 ? 'Safe' : safetyScore >= 55 ? 'Moderate Caution' : 'Extreme Caution',
      firCount: 0,
      recentSosCount: 0,
      crowdDensity: 'Moderate',
      lightingStars: 3, // genuinely unknown from OSM — neutral, not fabricated
      roadType: 'Pedestrian Walkway',
      policeDistanceMeters: nearestPolice ? nearestPolice.distanceMeters : place.distanceMeters,
      cctvPercent: 0, // unknown — UI shows this as "Not available", not "0% coverage"
      accessibility: {
        wheelchairRamps: false,
        stepFreeEntrances: false,
        cctvCoverage: false,
        smoothFootpaths: false,
        goodStreetlights: false,
        accessiblePublicWashrooms: false,
        policeBooths: place.type === 'police',
        phoneBooths: false,
        brailleSignage: false,
      },
      trustScore: 0, // unknown — UI shows this as "Not available"
      reportCount: 0,
      dataSource: 'osm-live',
      placeType: place.type,
    } as SafetyLocation;
  });
}