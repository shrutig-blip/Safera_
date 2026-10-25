import { SafetyLocation, CommunityReport } from '../types';
import type { LatLng } from '../lib/routing';

export type TimeOfDay = 'Day' | 'Dusk' | 'Night' | 'Late Night';

export interface SafetyGridCell {
  row: number;
  col: number;
  /** Cell center position as a percentage of the grid container (0-100). */
  xPct: number;
  yPct: number;
  /** Cell footprint as a percentage of the grid container. */
  widthPct: number;
  heightPct: number;
  /** Computed risk 0 (safest) - 100 (most dangerous). */
  risk: number;
  band: 'low' | 'moderate' | 'high' | 'critical';
  /** How many locations/reports actually influenced this cell (for the "why" tooltip). */
  contributingSignals: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

const GRID_COLS = 8;
const GRID_ROWS = 6;

/** Earth-distance between two lat/lng points, in meters. */
export function haversineDistanceMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number
): number {
  const R = 6371000; // meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const lat1 = toRad(aLat);
  const lat2 = toRad(bLat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Parses the app's relative timestamp strings ("Just now", "2 hours ago",
 * "1 day ago") into hours elapsed. Anything unrecognized is treated as
 * fairly old (48h) so a malformed timestamp doesn't accidentally dominate
 * the grid as breaking news.
 */
export function parseHoursAgo(timestamp: string): number {
  const t = timestamp.trim().toLowerCase();
  if (t === 'just now') return 0;

  const match = t.match(/(\d+)\s*(minute|hour|day|week)s?\s*ago/);
  if (!match) return 48;

  const value = parseInt(match[1], 10);
  switch (match[2]) {
    case 'minute':
      return value / 60;
    case 'hour':
      return value;
    case 'day':
      return value * 24;
    case 'week':
      return value * 24 * 7;
    default:
      return 48;
  }
}

/** Newer reports matter more. Half-life of 36h: a report loses half its weight every day and a half. */
function recencyWeight(hoursAgo: number): number {
  const halfLifeHours = 36;
  return Math.pow(0.5, hoursAgo / halfLifeHours);
}

/**
 * How much a report category should push the local risk score up (positive)
 * or down (negative — a confirmed "Safe Hub" report actively cools an area
 * off, the same way a new police kiosk would in real hotspot models).
 */
function categorySeverity(category: CommunityReport['category']): number {
  switch (category) {
    case 'Harassment':
      return 1.0;
    case 'Suspicious Follower':
      return 0.9;
    case 'Isolated Zone':
      return 0.75;
    case 'Poor Lighting':
      return 0.5;
    case 'Accessibility Defect':
      return 0.15;
    case 'Safe Hub':
      return -0.7;
    default:
      return 0.4;
  }
}

function gaussianKernel(distanceMeters: number, bandwidthMeters: number): number {
  const x = distanceMeters / bandwidthMeters;
  return Math.exp(-(x * x) / 2);
}

/**
 * How much darker/riskier this exact time of day makes things, before
 * factoring in whether a given spot is actually well-lit. 1.0 = no change.
 * Day and Dusk used to be mathematically identical (and so did Night and
 * Late Night), because the old code only checked a binary isDark flag —
 * this gives all four time periods a genuinely different value.
 */
function timeOfDayDarknessFactor(timeOfDay: TimeOfDay): number {
  switch (timeOfDay) {
    case 'Day':
      return 1.0;
    case 'Dusk':
      return 1.12;
    case 'Night':
      return 1.3;
    case 'Late Night':
      return 1.45;
    default:
      return 1.0;
  }
}

/**
 * Core risk computation shared by both the grid heatmap and the route-path
 * scorer below — computes real risk (0-100) at an arbitrary lat/lng from
 * every location's incident history and every report's severity/recency,
 * radiating outward with a Gaussian falloff. Kept as one function so the
 * heatmap and the route scorer never disagree about what "risky" means.
 *
 * Danger contributions are combined with a noisy-OR ("1 minus the product of
 * each source's survival probability"), not a plain sum. A plain sum was the
 * actual bug behind "everything renders as 100/100 red": each contribution
 * is already bounded to [0,1], but with more than 2-3 locations/reports
 * within the kernel's reach (very common — a handful of real OSM POIs is
 * normal) their raw sum blows past 1.0 and gets clamped to the max, so a
 * moderately-risky area with several nearby signals became visually
 * identical to a genuinely dangerous one. Noisy-OR combines multiple
 * partial-risk signals the way independent probabilities actually compose,
 * so it saturates smoothly instead of overshooting after 3-4 contributions.
 */
function computePointRisk(
  lat: number,
  lng: number,
  locations: SafetyLocation[],
  reports: CommunityReport[],
  timeOfDay: TimeOfDay,
  locationBandwidth: number,
  reportBandwidth: number
): number {
  const darkness = timeOfDayDarknessFactor(timeOfDay);

  // Noisy-OR accumulators: track "survival probability" (chance nothing bad
  // applies) and multiply in each new source's (1 - contribution). Final
  // danger = 1 - survival. Naturally bounded to [0,1) no matter how many
  // sources contribute, unlike a running sum.
  let dangerSurvival = 1;
  // Safe Hub reports actively cool an area off — tracked as their own
  // noisy-OR "safety" signal and used to temper (not just subtract from)
  // the final danger score, so one Safe Hub report can't fully cancel out
  // a real, separately-corroborated incident history.
  let safetySurvival = 1;

  for (const loc of locations) {
    const distance = haversineDistanceMeters(lat, lng, loc.lat, loc.lng);
    const kernel = gaussianKernel(distance, locationBandwidth);
    if (kernel < 0.02) continue;

    const baseRisk = (100 - loc.safetyScore) / 100;
    const incidentBoost = Math.min(1, loc.firCount * 0.06 + loc.recentSosCount * 0.12);
    let locationRisk = baseRisk * 0.7 + incidentBoost * 0.3;

    // Continuous darkness boost: scales with how genuinely unlit the spot
    // is (0 stars = full effect, 5 stars = none) instead of a hard <=2
    // threshold, and now applies (to a smaller degree) at Dusk too, not
    // just Night/Late Night.
    const lightingDeficiency = (5 - loc.lightingStars) / 5;
    const darkBoost = 1 + (darkness - 1) * lightingDeficiency;
    locationRisk = Math.min(1, locationRisk * darkBoost);

    const contribution = Math.min(1, Math.max(0, locationRisk * kernel));
    if (contribution > 0) dangerSurvival *= 1 - contribution;
  }

  for (const report of reports) {
    const distance = haversineDistanceMeters(lat, lng, report.lat, report.lng);
    const kernel = gaussianKernel(distance, reportBandwidth);
    if (kernel < 0.02) continue;

    const severity = categorySeverity(report.category);
    const recency = recencyWeight(parseHoursAgo(report.timestamp));
    const confidence = report.trustScore / 100;

    // Reports also react to time of day, just more gently than a location's
    // own lighting rating does (a report has no lighting field of its own).
    const reportDarkBoost = severity > 0 ? 1 + (darkness - 1) * 0.5 : 1;

    const raw = severity * recency * confidence * kernel * reportDarkBoost;
    if (raw >= 0) {
      const contribution = Math.min(1, raw);
      if (contribution > 0) dangerSurvival *= 1 - contribution;
    } else {
      const contribution = Math.min(1, -raw);
      if (contribution > 0) safetySurvival *= 1 - contribution;
    }
  }

  const dangerRisk = 1 - dangerSurvival; // [0, 1)
  const safetyReduction = 1 - safetySurvival; // [0, 1)
  const finalRisk = Math.max(0, dangerRisk - safetyReduction * 0.6);

  return Math.round(Math.min(100, Math.max(0, finalRisk * 100)));
}

function defaultBandwidths(locations: SafetyLocation[], reports: CommunityReport[]) {
  const box = computeBoundingBox(locations, reports);
  const boxHeightMeters = haversineDistanceMeters(box.minLat, box.minLng, box.maxLat, box.minLng);
  const boxWidthMeters = haversineDistanceMeters(box.minLat, box.minLng, box.minLat, box.maxLng);
  const locationBandwidth = Math.max(150, Math.min(boxWidthMeters, boxHeightMeters) * 0.28);
  const reportBandwidth = locationBandwidth * 0.6;
  return { locationBandwidth, reportBandwidth };
}

function computeBoundingBox(locations: SafetyLocation[], reports: CommunityReport[]): BoundingBox {
  const lats = [...locations.map((l) => l.lat), ...reports.map((r) => r.lat)];
  const lngs = [...locations.map((l) => l.lng), ...reports.map((r) => r.lng)];

  const rawMinLat = Math.min(...lats);
  const rawMaxLat = Math.max(...lats);
  const rawMinLng = Math.min(...lngs);
  const rawMaxLng = Math.max(...lngs);

  // Pad the box so points near the edge aren't rendered flush against the
  // container border, and so a single-point dataset still gets a usable box.
  const latPad = Math.max((rawMaxLat - rawMinLat) * 0.25, 0.01);
  const lngPad = Math.max((rawMaxLng - rawMinLng) * 0.25, 0.01);

  return {
    minLat: rawMinLat - latPad,
    maxLat: rawMaxLat + latPad,
    minLng: rawMinLng - lngPad,
    maxLng: rawMaxLng + lngPad,
  };
}

/** Maps a real lat/lng into an x/y percentage position within the grid container. */
export function projectToPct(lat: number, lng: number, box: BoundingBox): { xPct: number; yPct: number } {
  const xPct = ((lng - box.minLng) / (box.maxLng - box.minLng)) * 100;
  // Latitude increases northward but screen Y increases downward, so invert.
  const yPct = (1 - (lat - box.minLat) / (box.maxLat - box.minLat)) * 100;
  return {
    xPct: Math.min(100, Math.max(0, xPct)),
    yPct: Math.min(100, Math.max(0, yPct)),
  };
}

function riskBand(risk: number): SafetyGridCell['band'] {
  if (risk >= 76) return 'critical';
  if (risk >= 51) return 'high';
  if (risk >= 26) return 'moderate';
  return 'low';
}

/**
 * Builds a kernel-density-style risk grid from real location and report
 * data: each location's (100 - safetyScore) baseline plus its FIR/SOS
 * history, and each report's category severity × recency decay × trust
 * score, radiate outward with a Gaussian falloff and sum at every grid
 * cell — the same underlying idea as the hotspot-detection / KDE heatmaps
 * used in geospatial crime-analysis tools, just computed client-side over
 * the app's own live location + report state instead of a fixed image.
 */
export function computeSafetyGrid(
  locations: SafetyLocation[],
  reports: CommunityReport[],
  timeOfDay: TimeOfDay,
  gridCols = GRID_COLS,
  gridRows = GRID_ROWS
): SafetyGridCell[] {
  if (locations.length === 0 && reports.length === 0) return [];

  const box = computeBoundingBox(locations, reports);
  const cells: SafetyGridCell[] = [];
  const { locationBandwidth, reportBandwidth } = defaultBandwidths(locations, reports);

  for (let row = 0; row < gridRows; row++) {
    for (let col = 0; col < gridCols; col++) {
      const cellLat = box.maxLat - ((row + 0.5) / gridRows) * (box.maxLat - box.minLat);
      const cellLng = box.minLng + ((col + 0.5) / gridCols) * (box.maxLng - box.minLng);

      const risk = computePointRisk(
        cellLat, cellLng, locations, reports, timeOfDay, locationBandwidth, reportBandwidth
      );

      // Count nearby signals for the tooltip, same threshold used when scoring.
      let contributingSignals = 0;
      for (const loc of locations) {
        if (gaussianKernel(haversineDistanceMeters(cellLat, cellLng, loc.lat, loc.lng), locationBandwidth) > 0.1) contributingSignals++;
      }
      for (const report of reports) {
        if (gaussianKernel(haversineDistanceMeters(cellLat, cellLng, report.lat, report.lng), reportBandwidth) > 0.1) contributingSignals++;
      }

      cells.push({
        row,
        col,
        xPct: ((col + 0.5) / gridCols) * 100,
        yPct: ((row + 0.5) / gridRows) * 100,
        widthPct: 100 / gridCols,
        heightPct: 100 / gridRows,
        risk,
        band: riskBand(risk),
        contributingSignals,
      });
    }
  }

  return cells;
}

export function gridToBoundingBox(locations: SafetyLocation[], reports: CommunityReport[]): BoundingBox {
  return computeBoundingBox(locations, reports);
}

export interface NearestSafeResource {
  location: SafetyLocation;
  distanceMeters: number;
  reason: 'police-booth' | 'highest-safety-score';
}

/**
 * Finds the nearest genuinely useful place to head toward — a location with
 * an active police booth if one exists nearby, otherwise the highest-scoring
 * safe location overall. Mirrors the "resource allocation" idea from
 * geospatial crime-response tools: don't just show risk, point toward help.
 */
export function findNearestSafeResource(
  userLat: number,
  userLng: number,
  locations: SafetyLocation[]
): NearestSafeResource | null {
  if (locations.length === 0) return null;

  const withPoliceBooths = locations.filter((l) => l.accessibility.policeBooths && l.safetyScore >= 60);
  const pool = withPoliceBooths.length > 0 ? withPoliceBooths : locations.filter((l) => l.safetyScore >= 60);
  const candidates = pool.length > 0 ? pool : locations;

  let best: NearestSafeResource | null = null;
  for (const loc of candidates) {
    const distanceMeters = haversineDistanceMeters(userLat, userLng, loc.lat, loc.lng);
    if (!best || distanceMeters < best.distanceMeters) {
      best = {
        location: loc,
        distanceMeters,
        reason: withPoliceBooths.length > 0 ? 'police-booth' : 'highest-safety-score',
      };
    }
  }
  return best;
}

export interface RoutePathAssessment {
  /** 0-100, higher = safer. Derived entirely from real distance to known locations/reports, not guessed. */
  pathSafetyScore: number;
  avgRisk: number;
  maxRisk: number;
  /** Kernel-weighted average of nearby locations' real lighting rating, as a percentage. */
  lightingPercent: number;
  /** Kernel-weighted average of nearby locations' real CCTV coverage. */
  cctvPercent: number;
  /** Share of the route's sampled points that fall near a location with wheelchair-accessible infrastructure. */
  accessibilityPercent: number;
  /** True if any sampled point on the route passes within ~400m of a location with an active police booth. */
  policeBoothNearby: boolean;
  /** Human-readable warnings for the specific risky stretches actually found along this path. */
  riskSegments: string[];
  /**
   * True when there was no real location/report data anywhere near this
   * route to score against. When true, every numeric field above is a
   * neutral placeholder, not a measurement — callers should show an
   * "insufficient data" state instead of presenting these as real scores.
   */
  insufficientData: boolean;
}

const ROUTE_SAMPLE_COUNT = 30;
const NEARBY_LOCATION_MAX_METERS = 1200;
const POLICE_BOOTH_PROXIMITY_METERS = 400;

/**
 * Scores a real routed path (e.g. one OSRM alternative) against actual
 * location and community-report data — same idea as the danger-index /
 * K-means approach used in geospatial safe-routing research (score path
 * segments against real crime/incident data rather than trusting a
 * black-box "safety score"), computed here client-side via the same
 * Gaussian-kernel risk model that drives the Live Safety Grid.
 */
export function scoreRoutePath(
  path: LatLng[],
  locations: SafetyLocation[],
  reports: CommunityReport[],
  timeOfDay: TimeOfDay
): RoutePathAssessment {
  if (path.length === 0 || (locations.length === 0 && reports.length === 0)) {
    return {
      pathSafetyScore: 70,
      avgRisk: 30,
      maxRisk: 30,
      lightingPercent: 60,
      cctvPercent: 50,
      accessibilityPercent: 50,
      policeBoothNearby: false,
      riskSegments: [],
      insufficientData: true,
    };
  }

  const { locationBandwidth, reportBandwidth } = defaultBandwidths(locations, reports);

  // Evenly sample the path by index (OSRM paths can have hundreds of
  // points; a few dozen evenly-spaced samples is plenty for a smooth score
  // without doing a kernel sum per raw vertex).
  const step = Math.max(1, Math.floor(path.length / ROUTE_SAMPLE_COUNT));
  const sampledIndices: number[] = [];
  for (let i = 0; i < path.length; i += step) sampledIndices.push(i);
  if (sampledIndices[sampledIndices.length - 1] !== path.length - 1) {
    sampledIndices.push(path.length - 1);
  }

  // Cumulative distance along the full path, so risky stretches can be
  // described by real "near the Xm mark" position rather than sample index.
  const cumulativeDistances: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    cumulativeDistances.push(
      cumulativeDistances[i - 1] + haversineDistanceMeters(path[i - 1].lat, path[i - 1].lng, path[i].lat, path[i].lng)
    );
  }

  let riskSum = 0;
  let maxRisk = 0;
  let lightingSum = 0;
  let cctvSum = 0;
  let accessibleCount = 0;
  let policeBoothNearby = false;

  interface Sample {
    distanceAlongRoute: number;
    risk: number;
    lat: number;
    lng: number;
    nearestLocationName: string | null;
  }
  const samples: Sample[] = [];

  for (const idx of sampledIndices) {
    const point = path[idx];
    const risk = computePointRisk(point.lat, point.lng, locations, reports, timeOfDay, locationBandwidth, reportBandwidth);
    riskSum += risk;
    maxRisk = Math.max(maxRisk, risk);

    // Nearest real location, used to ground lighting/CCTV/accessibility
    // numbers and to name risky segments after an actual place.
    let nearest: SafetyLocation | null = null;
    let nearestDistance = Infinity;
    for (const loc of locations) {
      const d = haversineDistanceMeters(point.lat, point.lng, loc.lat, loc.lng);
      if (d < nearestDistance) {
        nearestDistance = d;
        nearest = loc;
      }
    }

    const withinRange = nearest && nearestDistance <= NEARBY_LOCATION_MAX_METERS;
    lightingSum += withinRange ? nearest!.lightingStars * 20 : 60;
    cctvSum += withinRange ? nearest!.cctvPercent : 50;
    if (withinRange && nearest!.accessibility.wheelchairRamps) accessibleCount++;
    if (nearest && nearest.accessibility.policeBooths && nearestDistance <= POLICE_BOOTH_PROXIMITY_METERS) {
      policeBoothNearby = true;
    }

    samples.push({
      distanceAlongRoute: cumulativeDistances[idx],
      risk,
      lat: point.lat,
      lng: point.lng,
      nearestLocationName: withinRange ? nearest!.name : null,
    });
  }

  const n = samples.length;
  const avgRisk = riskSum / n;
  const pathSafetyScore = Math.round(100 - Math.min(100, Math.max(0, avgRisk * 0.55 + maxRisk * 0.45)));

  // Group contiguous high-risk samples (>=51, matching the grid's "high"
  // band) into segments so the warning describes one real stretch of the
  // route instead of listing every individual sample point.
  const riskSegments: string[] = [];
  let segmentStart: Sample | null = null;
  let segmentPeak = 0;
  let segmentPlace: string | null = null;

  const flushSegment = (endSample: Sample) => {
    if (!segmentStart) return;
    const fromM = Math.round(segmentStart.distanceAlongRoute);
    const toM = Math.round(endSample.distanceAlongRoute);
    const placeSuffix = segmentPlace ? ` near ${segmentPlace}` : '';
    riskSegments.push(
      `Elevated risk (${segmentPeak}/100) between the ${fromM}m and ${toM}m mark${placeSuffix}`
    );
    segmentStart = null;
    segmentPeak = 0;
    segmentPlace = null;
  };

  for (const sample of samples) {
    if (sample.risk >= 51) {
      if (!segmentStart) segmentStart = sample;
      if (sample.risk > segmentPeak) {
        segmentPeak = sample.risk;
        segmentPlace = sample.nearestLocationName;
      }
    } else if (segmentStart) {
      flushSegment(sample);
    }
  }
  if (segmentStart) flushSegment(samples[samples.length - 1]);

  return {
    pathSafetyScore,
    avgRisk: Math.round(avgRisk),
    maxRisk,
    lightingPercent: Math.round(Math.min(100, lightingSum / n)),
    cctvPercent: Math.round(Math.min(100, cctvSum / n)),
    accessibilityPercent: Math.round((accessibleCount / n) * 100),
    policeBoothNearby,
    riskSegments: riskSegments.slice(0, 3), // keep the card readable
    insufficientData: false,
  };
}

export interface RankedRoute {
  /** Index of this path within the originally-passed `paths` array. */
  routeIndex: number;
  assessment: RoutePathAssessment;
  /** 1 = safest of the set. Ties broken by lower maxRisk, then shorter distance. */
  rank: number;
  /** Coarse label for badges/legends, analogous to a multi-route comparison UI. */
  recommendation: 'safest' | 'safe' | 'moderate' | 'risky';
  totalDistanceMeters: number;
}

function recommendationLabel(score: number): RankedRoute['recommendation'] {
  if (score >= 76) return 'safest';
  if (score >= 51) return 'safe';
  if (score >= 26) return 'moderate';
  return 'risky';
}

function pathDistanceMeters(path: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += haversineDistanceMeters(path[i - 1].lat, path[i - 1].lng, path[i].lat, path[i].lng);
  }
  return total;
}

/**
 * Scores every candidate route alternative (e.g. all of OSRM's `alternatives`
 * for one A→B request) against the same real location/report data and
 * returns them ranked safest-first. This is the client-side equivalent of
 * comparing "Route 1 / Route 2 / Route 3" danger indices side by side —
 * except every score here comes from `scoreRoutePath`'s real Gaussian-kernel
 * risk model instead of a discretized crime bucket, so two routes are never
 * tied just because they landed in the same coarse bin.
 *
 * Only the first route with `insufficientData: false` is treated as a real
 * measurement for ranking purposes; if every candidate has no nearby data,
 * all routes are returned in their original order with `insufficientData`
 * left true so the UI can fall back to distance/time instead of safety.
 */
export function rankRouteAlternatives(
  paths: LatLng[][],
  locations: SafetyLocation[],
  reports: CommunityReport[],
  timeOfDay: TimeOfDay
): RankedRoute[] {
  const scored = paths.map((path, routeIndex) => ({
    routeIndex,
    assessment: scoreRoutePath(path, locations, reports, timeOfDay),
    totalDistanceMeters: pathDistanceMeters(path),
  }));

  const sorted = [...scored].sort((a, b) => {
    if (a.assessment.insufficientData !== b.assessment.insufficientData) {
      return a.assessment.insufficientData ? 1 : -1;
    }
    if (b.assessment.pathSafetyScore !== a.assessment.pathSafetyScore) {
      return b.assessment.pathSafetyScore - a.assessment.pathSafetyScore;
    }
    if (a.assessment.maxRisk !== b.assessment.maxRisk) {
      return a.assessment.maxRisk - b.assessment.maxRisk;
    }
    return a.totalDistanceMeters - b.totalDistanceMeters;
  });

  return sorted.map((entry, i) => ({
    ...entry,
    rank: i + 1,
    recommendation: entry.assessment.insufficientData
      ? 'moderate'
      : recommendationLabel(entry.assessment.pathSafetyScore),
  }));
}

export interface RouteRiskMarker {
  lat: number;
  lng: number;
  distanceAlongRouteMeters: number;
  risk: number;
  band: SafetyGridCell['band'];
  nearestLocationName: string | null;
}

/**
 * Samples a route path and returns the actual lat/lng points where risk
 * crosses into 'moderate' or worse, for dropping map pins along the route —
 * the equivalent of the smiley/skull/cross marker legend in danger-index
 * safe-routing tools, but positioned by real kernel-computed risk rather
 * than a fixed per-neighborhood bucket. Consecutive samples in the same
 * band are thinned so markers don't cluster on top of each other.
 */
export function getRouteRiskMarkers(
  path: LatLng[],
  locations: SafetyLocation[],
  reports: CommunityReport[],
  timeOfDay: TimeOfDay,
  minBand: SafetyGridCell['band'] = 'moderate'
): RouteRiskMarker[] {
  if (path.length === 0 || (locations.length === 0 && reports.length === 0)) return [];

  const bandRank: Record<SafetyGridCell['band'], number> = { low: 0, moderate: 1, high: 2, critical: 3 };
  const minRank = bandRank[minBand];

  const { locationBandwidth, reportBandwidth } = defaultBandwidths(locations, reports);

  const step = Math.max(1, Math.floor(path.length / ROUTE_SAMPLE_COUNT));
  const sampledIndices: number[] = [];
  for (let i = 0; i < path.length; i += step) sampledIndices.push(i);
  if (sampledIndices[sampledIndices.length - 1] !== path.length - 1) {
    sampledIndices.push(path.length - 1);
  }

  const cumulativeDistances: number[] = [0];
  for (let i = 1; i < path.length; i++) {
    cumulativeDistances.push(
      cumulativeDistances[i - 1] + haversineDistanceMeters(path[i - 1].lat, path[i - 1].lng, path[i].lat, path[i].lng)
    );
  }

  const markers: RouteRiskMarker[] = [];
  let lastBand: SafetyGridCell['band'] | null = null;

  for (const idx of sampledIndices) {
    const point = path[idx];
    const risk = computePointRisk(point.lat, point.lng, locations, reports, timeOfDay, locationBandwidth, reportBandwidth);
    const band = riskBand(risk);
    if (bandRank[band] < minRank) {
      lastBand = null;
      continue;
    }
    // Only drop a new marker when severity actually changes, so a long
    // uniformly-risky stretch gets one pin at its start, not one per sample.
    if (band === lastBand) continue;
    lastBand = band;

    let nearest: SafetyLocation | null = null;
    let nearestDistance = Infinity;
    for (const loc of locations) {
      const d = haversineDistanceMeters(point.lat, point.lng, loc.lat, loc.lng);
      if (d < nearestDistance) {
        nearestDistance = d;
        nearest = loc;
      }
    }

    markers.push({
      lat: point.lat,
      lng: point.lng,
      distanceAlongRouteMeters: Math.round(cumulativeDistances[idx]),
      risk,
      band,
      nearestLocationName: nearest && nearestDistance <= NEARBY_LOCATION_MAX_METERS ? nearest.name : null,
    });
  }

  return markers;
}

/** Tailwind-friendly color tokens per risk band, kept consistent with the app's existing rose/amber palette. */
export function riskBandColor(band: SafetyGridCell['band']): string {
  switch (band) {
    case 'critical':
      return 'rgba(167, 25, 75, 0.55)'; // deep rose
    case 'high':
      return 'rgba(167, 25, 75, 0.32)';
    case 'moderate':
      return 'rgba(242, 201, 76, 0.28)'; // amber
    default:
      return 'rgba(95, 167, 119, 0.14)'; // soft green, barely-there
  }
}