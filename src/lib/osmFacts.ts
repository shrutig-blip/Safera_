import type { LatLng } from './routing';

export interface OsmFacts {
  /** Roads within ~12 m of the route that OpenStreetMap knows about. */
  waysNearby: number;
  /** 0-100 share of tagged roads that are lit; null when too few roads are tagged to say. */
  lightingPercent: number | null;
  lampsPerKm: number;
  /** Staircases lying on the route itself. */
  stairCount: number;
  /** null when OSM has no road data for this route. */
  stepFreePercent: number | null;
  policeCount: number;
  nearestPoliceMeters: number | null;
  /** 0-1 share of nearby road segments that are main roads; null if not enough roads found. */
  mainRoadShare: number | null;
  /** Fuel stations, hospitals, clinics, pharmacies, bus stations and metro/rail stops near the route. */
  publicPlaces: number;
  publicPlacesPerKm: number;
}

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

const LIT_VALUES = new Set(['yes', '24/7', 'automatic', 'sunset-sunrise']);
const MAIN_ROADS = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link',
]);
const MINOR_ROADS = new Set(['residential', 'unclassified', 'living_street']);

const toRad = (d: number) => (d * Math.PI) / 180;
function meters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Evenly spaced points along the route. Capped at ~30 points to keep the query small. */
function samplePath(path: LatLng[], totalMeters: number): LatLng[] {
  const spacing = Math.max(350, totalMeters / 30);
  const out: LatLng[] = [path[0]];
  let acc = 0;
  for (let i = 1; i < path.length; i++) {
    acc += meters(path[i - 1], path[i]);
    if (acc >= spacing) {
      out.push(path[i]);
      acc = 0;
    }
  }
  const last = path[path.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Overpass is a free shared server and rejects bursts of parallel requests.
// Every lookup goes through this queue so they run one at a time.
let queue: Promise<unknown> = Promise.resolve();
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.then(
    () => sleep(500),
    () => sleep(500),
  );
  return run;
}

const cache = new Map<string, Promise<OsmFacts | null>>();

export function fetchOsmFacts(path: LatLng[], totalMeters: number): Promise<OsmFacts | null> {
  if (path.length < 2) return Promise.resolve(null);
  const key = `${Math.round(totalMeters)}|${path[0].lat.toFixed(4)},${path[0].lng.toFixed(4)}|${path[path.length - 1].lat.toFixed(4)},${path[path.length - 1].lng.toFixed(4)}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      enqueue(() => load(path, totalMeters)).then((r) => {
        if (!r) cache.delete(key); // never cache a failure
        return r;
      }),
    );
  }
  return cache.get(key)!;
}

async function runQuery(query: string): Promise<any[] | null> {
  // two passes over the endpoints, so one busy server doesn't sink the lookup
  for (let pass = 0; pass < 2; pass++) {
    for (const url of ENDPOINTS) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 40000);
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (!res.ok) {
          console.warn(`[osmFacts] ${url} responded ${res.status}`);
          if (res.status === 429) await sleep(2500);
          continue;
        }
        const json = await res.json();
        // Overpass can answer 200 with a "runtime error" remark when it gave up.
        if (json.remark && /runtime error|timed out/i.test(json.remark)) {
          console.warn(`[osmFacts] ${url} remark: ${json.remark}`);
          continue;
        }
        return json.elements ?? [];
      } catch (err) {
        console.warn(`[osmFacts] ${url} failed`, err);
      }
    }
    await sleep(1500);
  }
  return null;
}

async function load(path: LatLng[], totalMeters: number): Promise<OsmFacts | null> {
  const samples = samplePath(path, totalMeters);
  const pts = samples.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(',');

  const query = `
    [out:json][timeout:35];
    (
      way(around:12,${pts})["highway"]["highway"!="steps"];
      way(around:10,${pts})["highway"="steps"];
      node(around:25,${pts})["highway"="street_lamp"];
      nwr(around:400,${pts})["amenity"="police"];
      nwr(around:150,${pts})["amenity"~"^(hospital|clinic|pharmacy|fuel|bus_station)$"];
      nwr(around:150,${pts})["railway"~"^(station|subway_entrance)$"];
    );
    out tags center qt;`;

  const elements = await runQuery(query);
  if (!elements) return null; // OSM unreachable: caller keeps the scores it already has

  const highways = elements.filter((e) => e.type === 'way' && e.tags?.highway);
  const ways = highways.filter((w) => w.tags.highway !== 'steps');
  const stairs = highways.filter((w) => w.tags.highway === 'steps');
  const lamps = elements.filter((e) => e.type === 'node' && e.tags?.highway === 'street_lamp');
  const police = elements.filter((e) => e.tags?.amenity === 'police');
  const publicPlaces = elements.filter(
    (e) =>
      (e.tags?.amenity && /^(hospital|clinic|pharmacy|fuel|bus_station)$/.test(e.tags.amenity)) ||
      (e.tags?.railway && /^(station|subway_entrance)$/.test(e.tags.railway)),
  );

  // Lighting: only trust it when enough nearby roads actually carry a "lit" tag.
  const litTagged = ways.filter((w) => w.tags.lit !== undefined);
  const litYes = litTagged.filter((w) => LIT_VALUES.has(String(w.tags.lit)));
  const taggedShare = ways.length ? litTagged.length / ways.length : 0;
  const lightingPercent =
    litTagged.length >= 3 && taggedShare >= 0.3 ? Math.round((100 * litYes.length) / litTagged.length) : null;

  // Step-free: any staircase on the route is a real barrier; each one costs 35 points.
  const stepFreePercent = ways.length === 0 && stairs.length === 0 ? null : Math.max(0, 100 - stairs.length * 35);

  // Main-road share among real road segments (ignoring footpaths/service lanes).
  const main = ways.filter((w) => MAIN_ROADS.has(w.tags.highway)).length;
  const minor = ways.filter((w) => MINOR_ROADS.has(w.tags.highway)).length;
  const mainRoadShare = main + minor >= 2 ? main / (main + minor) : null;

  let nearestPoliceMeters: number | null = null;
  for (const p of police) {
    const loc = p.type === 'node' ? { lat: p.lat, lng: p.lon } : p.center ? { lat: p.center.lat, lng: p.center.lon } : null;
    if (!loc) continue;
    const d = Math.min(...samples.map((s) => meters(s, loc)));
    if (nearestPoliceMeters === null || d < nearestPoliceMeters) nearestPoliceMeters = d;
  }

  const km = Math.max(0.1, totalMeters / 1000);
  return {
    waysNearby: ways.length,
    lightingPercent,
    lampsPerKm: lamps.length / km,
    stairCount: stairs.length,
    stepFreePercent,
    policeCount: police.length,
    nearestPoliceMeters: nearestPoliceMeters === null ? null : Math.round(nearestPoliceMeters),
    mainRoadShare,
    publicPlaces: publicPlaces.length,
    publicPlacesPerKm: publicPlaces.length / km,
  };
}