export interface GeocodedPlace {
  lat: number;
  lng: number;
  displayName: string;
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const NOMINATIM_REVERSE_URL = 'https://nominatim.openstreetmap.org/reverse';

export async function geocodePlace(
  query: string,
  opts?: { countryCode?: string }
): Promise<GeocodedPlace | null> {
  if (!query || !query.trim()) return null;

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '1',
  });
  if (opts?.countryCode) params.set('countrycodes', opts.countryCode);

  const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
    headers: { 'Accept-Language': 'en' },
  });
  if (!res.ok) throw new Error(`Geocoding failed: ${res.status}`);

  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const best = data[0];
  return {
    lat: parseFloat(best.lat),
    lng: parseFloat(best.lon),
    displayName: best.display_name,
  };
}

/**
 * Returns multiple candidate matches for autocomplete-style suggestions.
 */
export async function searchPlaces(query: string, limit = 5): Promise<GeocodedPlace[]> {
  if (!query || query.trim().length < 3) return [];

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: String(limit),
  });

  const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, {
    headers: { 'Accept-Language': 'en' },
  });

  if (!res.ok) return [];
  const data = await res.json();
  if (!Array.isArray(data)) return [];

  return data.map((d: any) => ({
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
    displayName: d.display_name,
  }));
}

/**
 * Reverse geocode: convert coordinates into a human-readable place name.
 */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  const params = new URLSearchParams({
    lat: String(lat),
    lon: String(lng),
    format: 'json',
  });

  const res = await fetch(`${NOMINATIM_REVERSE_URL}?${params.toString()}`, {
    headers: { 'Accept-Language': 'en' },
  });

  if (!res.ok) return null;

  const data = await res.json();
  return data?.display_name ?? null;
}