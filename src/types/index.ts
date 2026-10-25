export type RiskLevel = 'Safe' | 'Moderate Caution' | 'High Risk' | 'Extreme Caution';

export interface AccessibilityFeatures {
  wheelchairRamps: boolean;
  stepFreeEntrances: boolean;
  cctvCoverage: boolean;
  smoothFootpaths: boolean;
  goodStreetlights: boolean;
  accessiblePublicWashrooms: boolean;
  policeBooths: boolean;
  phoneBooths: boolean;
  brailleSignage: boolean;
  elevatorAccess: boolean;
  tactilePaving: boolean;
}

export interface SafetyLocation {
  id: string;
  name: string;
  area: string;
  lat: number;
  lng: number;
  safetyScore: number; // 0-100
  riskLevel: RiskLevel;
  firCount: number;
  recentSosCount: number;
  crowdDensity: 'High' | 'Moderate' | 'Low' | 'Isolated';
  lightingStars: number; // 1-5
  roadType: 'Main Highway' | 'Commercial Boulevard' | 'Suburban Corridor' | 'Narrow Alleyway' | 'Pedestrian Walkway';
  policeDistanceMeters: number;
  cctvPercent: number;
  accessibility: AccessibilityFeatures;
  trustScore: number; // 0-100% based on pattern recognition
  reportCount: number;
  /**
   * Where this location's data actually came from. 'osm-live' = fetched
   * just now from OpenStreetMap/Overpass for real, real coordinates — its
   * firCount/cctvPercent/trustScore/lightingStars are honestly unknown
   * (left at neutral placeholders, not fabricated) since no public source
   * has real crime data. 'seed-fallback' = the bundled demo dataset, only
   * used when a live fetch isn't possible. Undefined = pre-existing seed
   * data from before this field existed; treat the same as seed-fallback.
   */
  dataSource?: 'osm-live' | 'seed-fallback';
  /** Only set for osm-live locations — what kind of real place this is. */
  placeType?: 'police' | 'hospital' | 'pharmacy' | 'fire_station';
}

export interface CommunityReport {
  id: string;
  locationName: string;
  lat: number;
  lng: number;
  category: 'Harassment' | 'Poor Lighting' | 'Isolated Zone' | 'Suspicious Follower' | 'Accessibility Defect' | 'Safe Hub';
  description: string;
  timestamp: string;
  trustScore: number; // e.g. 96%
  verifiedByPattern: boolean;
  verifiedCount: number;
  upvotes: number;
  photos?: string[];
  status: 'Active' | 'Under Verification' | 'Resolved';
}

export interface RouteOption {
  id: string;
  name: string;
  tag: string;
  distance: string;
  estimatedTime: string;
  safetyScore: number;
  accessibilityScore: number;
  lightingPercent: number;
  cctvCoverage: number;
  policeBoothNearby: boolean;
  highlights: string[];
  riskSegments: string[];
}

export interface EmergencyContact {
  id: string;
  name: string;
  relation: string;
  phone: string;
  isPrimary: boolean;
  sendSms: boolean;
}

export interface EvidenceItem {
  id: string;
  title: string;
  type: 'video' | 'audio' | 'photo';
  timestamp: string;
  locationName: string;
  coords: { lat: number; lng: number };
  duration?: string;
  fileSize: string;
  mediaUrl: string;
  isEncrypted: boolean;
  isCloudBackedUp: boolean;
}

export interface VitalSignData {
  timestamp: string;
  heartRate: number; // bpm
  hrv: number; // ms
  stressLevel: number; // 0-100
  isSpike: boolean;
  wearableName: string;
  connected: boolean;
}

export interface MovementSensorSettings {
  isEnabled: boolean;
  fallDetection: boolean;
  shakingDetection: boolean;
  draggingDetection: boolean;
  inactivityThresholdHours: number; // e.g. 5 hours
  autoCheckInIntervalMinutes: number; // e.g. 15 or 30 min
}

export interface LegalRightsArticle {
  id: string;
  title: string;
  category: 'Police Interactions' | 'Women Safety' | 'Senior Citizens & Disability' | 'Bystander Protection' | 'Workplace POSH' | 'Zero FIR & Emergency';
  summary: string;
  keyRights: string[];
  statutes: string[];
  actionSteps: string[];
}

export interface FakeCallConfig {
  callerName: string;
  callerNumber: string;
  delaySeconds: number;
  voiceScript: string;
  langCode: string; 
}

// ---- Account / Auth ----

export interface UserProfile {
  id: string;
  name: string;
  age: number;
  email: string;
  phone: string;
  gender?: 'Female' | 'Male' | 'Non-binary' | 'Prefer not to say';
  city: string;
  bloodGroup?: string;
  locationAccessGranted: boolean;
  lastKnownLocation?: { lat: number; lng: number } | null;
  emergencyContacts: EmergencyContact[];
  createdAt: string;
  isDemo?: boolean;
}

// Shape stored in localStorage per registered account.
// NOTE: this is a client-only demo auth system (no backend), so the
// password is only lightly hashed (SHA-256) purely to avoid storing it in
// plaintext in localStorage. It is NOT secure enough for a real production
// login — swap this out for a real backend + proper auth (e.g. bcrypt on
// the server, or a provider like Firebase/Auth0) before going live.
export interface StoredAccount {
  profile: UserProfile;
  passwordHash: string;
  /** Same SHA-256 approach as passwordHash, scoped to the Evidence Vault PIN. Undefined until the user sets one on first vault visit. */
  vaultPinHash?: string;
}