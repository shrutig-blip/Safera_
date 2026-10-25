import { SafetyLocation, CommunityReport, EmergencyContact, EvidenceItem, LegalRightsArticle } from '../types';

export const INITIAL_LOCATIONS: SafetyLocation[] = [
  {
    id: 'loc-1',
    name: 'Metro Square Junction & Central Walkway',
    area: 'Downtown Core',
    lat: 28.6139,
    lng: 77.209,
    safetyScore: 92,
    riskLevel: 'Safe',
    firCount: 0,
    recentSosCount: 0,
    crowdDensity: 'High',
    lightingStars: 5,
    roadType: 'Commercial Boulevard',
    policeDistanceMeters: 120,
    cctvPercent: 95,
    accessibility: {
      wheelchairRamps: true,
      stepFreeEntrances: true,
      cctvCoverage: true,
      smoothFootpaths: true,
      goodStreetlights: true,
      accessiblePublicWashrooms: true,
      policeBooths: true,
      phoneBooths: true,
      brailleSignage: true,
      elevatorAccess: true,
      tactilePaving: true,
    },
    trustScore: 98,
    reportCount: 34,
  },
  {
    id: 'loc-2',
    name: 'North Railway Underpass & Rear Alley',
    area: 'Industrial Transit West',
    lat: 28.621,
    lng: 77.215,
    safetyScore: 38,
    riskLevel: 'High Risk',
    firCount: 5,
    recentSosCount: 3,
    crowdDensity: 'Isolated',
    lightingStars: 1,
    roadType: 'Narrow Alleyway',
    policeDistanceMeters: 850,
    cctvPercent: 20,
    accessibility: {
      wheelchairRamps: false,
      stepFreeEntrances: false,
      cctvCoverage: false,
      smoothFootpaths: false,
      goodStreetlights: false,
      accessiblePublicWashrooms: false,
      policeBooths: false,
      phoneBooths: false,
      brailleSignage: false,
      elevatorAccess: false,
      tactilePaving: false,
    },
    trustScore: 94,
    reportCount: 19,
  },
  {
    id: 'loc-3',
    name: 'Civic Park Promenade & Botanical Gardens',
    area: 'Greenbelt Sector 4',
    lat: 28.608,
    lng: 77.225,
    safetyScore: 78,
    riskLevel: 'Safe',
    firCount: 1,
    recentSosCount: 0,
    crowdDensity: 'Moderate',
    lightingStars: 4,
    roadType: 'Pedestrian Walkway',
    policeDistanceMeters: 300,
    cctvPercent: 80,
    accessibility: {
      wheelchairRamps: true,
      stepFreeEntrances: true,
      cctvCoverage: true,
      smoothFootpaths: true,
      goodStreetlights: true,
      accessiblePublicWashrooms: true,
      policeBooths: true,
      phoneBooths: false,
      brailleSignage: true,
      elevatorAccess: false,
      tactilePaving: true,
    },
    trustScore: 96,
    reportCount: 28,
  },
  {
    id: 'loc-4',
    name: 'Old Wholesale Market Lane',
    area: 'Heritage Quarter',
    lat: 28.628,
    lng: 77.202,
    safetyScore: 52,
    riskLevel: 'Moderate Caution',
    firCount: 3,
    recentSosCount: 1,
    crowdDensity: 'Low',
    lightingStars: 2,
    roadType: 'Narrow Alleyway',
    policeDistanceMeters: 600,
    cctvPercent: 45,
    accessibility: {
      wheelchairRamps: false,
      stepFreeEntrances: true,
      cctvCoverage: true,
      smoothFootpaths: false,
      goodStreetlights: false,
      accessiblePublicWashrooms: false,
      policeBooths: false,
      phoneBooths: true,
      brailleSignage: false,
      elevatorAccess: false,
      tactilePaving: false,
    },
    trustScore: 89,
    reportCount: 15,
  },
  {
    id: 'loc-5',
    name: 'St. Mary’s Care Hospital & Senior Hub',
    area: 'Medical Zone East',
    lat: 28.602,
    lng: 77.218,
    safetyScore: 96,
    riskLevel: 'Safe',
    firCount: 0,
    recentSosCount: 0,
    crowdDensity: 'High',
    lightingStars: 5,
    roadType: 'Suburban Corridor',
    policeDistanceMeters: 80,
    cctvPercent: 98,
    accessibility: {
      wheelchairRamps: true,
      stepFreeEntrances: true,
      cctvCoverage: true,
      smoothFootpaths: true,
      goodStreetlights: true,
      accessiblePublicWashrooms: true,
      policeBooths: true,
      phoneBooths: true,
      brailleSignage: true,
      elevatorAccess: true,
      tactilePaving: true,
    },
    trustScore: 99,
    reportCount: 42,
  }
];

export const INITIAL_REPORTS: CommunityReport[] = [
  {
    id: 'rep-101',
    locationName: 'North Railway Underpass',
    lat: 28.621,
    lng: 77.215,
    category: 'Poor Lighting',
    description: '3 high-intensity streetlight posts broken for past 4 days. Very pitch dark after 8:30 PM.',
    timestamp: '2 hours ago',
    trustScore: 97,
    verifiedByPattern: true,
    verifiedCount: 14,
    upvotes: 38,
    status: 'Active'
  },
  {
    id: 'rep-102',
    locationName: 'Old Wholesale Market Lane',
    lat: 28.628,
    lng: 77.202,
    category: 'Accessibility Defect',
    description: 'Ramp broken due to construction work; wheelchair users forced to travel on main traffic road.',
    timestamp: '5 hours ago',
    trustScore: 92,
    verifiedByPattern: true,
    verifiedCount: 8,
    upvotes: 21,
    status: 'Active'
  },
  {
    id: 'rep-103',
    locationName: 'Metro Square Plaza Entrance 2',
    lat: 28.6139,
    lng: 77.209,
    category: 'Safe Hub',
    description: 'New 24/7 Police Assistance Kiosk installed with active female officer on duty.',
    timestamp: '1 day ago',
    trustScore: 99,
    verifiedByPattern: true,
    verifiedCount: 29,
    upvotes: 84,
    status: 'Resolved'
  }
];

export const INITIAL_CONTACTS: EmergencyContact[] = [
  {
    id: 'c-1',
    name: 'Sarah Connor (Sister)',
    relation: 'Family',
    phone: '+1 (555) 019-2834',
    isPrimary: true,
    sendSms: true,
  },
  {
    id: 'c-2',
    name: 'David Vance (Friend)',
    relation: 'Trusted Friend',
    phone: '+1 (555) 014-9821',
    isPrimary: false,
    sendSms: true,
  },
  {
    id: 'c-3',
    name: 'Local Emergency Helpline / Police',
    relation: 'Authority Dispatch',
    phone: '112',
    isPrimary: false,
    sendSms: true,
  }
];

export const INITIAL_EVIDENCE: EvidenceItem[] = [
  {
    id: 'ev-1',
    title: 'Incident_Audio_Underpass.m4a',
    type: 'audio',
    timestamp: '2026-07-28 21:42:10',
    locationName: 'North Railway Underpass',
    coords: { lat: 28.621, lng: 77.215 },
    duration: '01:45',
    fileSize: '2.4 MB',
    mediaUrl: '',
    isEncrypted: true,
    isCloudBackedUp: true,
  },
  {
    id: 'ev-2',
    title: 'FrontCam_Footage_Market.mp4',
    type: 'video',
    timestamp: '2026-07-27 22:15:04',
    locationName: 'Old Wholesale Market Lane',
    coords: { lat: 28.628, lng: 77.202 },
    duration: '00:32',
    fileSize: '8.1 MB',
    mediaUrl: '',
    isEncrypted: true,
    isCloudBackedUp: true,
  }
];

export const INITIAL_LEGAL_ARTICLES: LegalRightsArticle[] = [
  {
    id: 'leg-1',
    title: 'Zero FIR Rights & Immediate Filing',
    category: 'Zero FIR & Emergency',
    summary: 'You have the absolute right to register a Zero FIR at any police station regardless of where the incident occurred.',
    keyRights: [
      'Police officers CANNOT refuse to record a complaint on jurisdictional grounds.',
      'A Zero FIR is transferred automatically to the appropriate police station without delay.',
      'You are entitled to a free carbon copy or digital copy of the registered complaint.'
    ],
    statutes: ['CrPC Section 154', 'Supreme Court Directive - Lalita Kumari Case'],
    actionSteps: [
      'Inform the station officer you are registering a "Zero FIR".',
      'If officer hesitates, cite Lalita Kumari Ruling & request Superintendent details.',
      'Keep your GuardIA evidence vault link recorded.'
    ]
  },
  {
    id: 'leg-2',
    title: 'Women Security & Night Arrest Protections',
    category: 'Women Safety',
    summary: 'Special constitutional and criminal procedures protect female citizens during questioning and custody.',
    keyRights: [
      'No female can be arrested after sunset (6 PM) and before sunrise (6 AM) except under magistrate authorization.',
      'Questioning of female victims/complainants must take place at their residence in the presence of family or female constable.',
      'Right to zero-cost legal counsel & medical examination by female doctors.'
    ],
    statutes: ['CrPC Section 46(4)', 'CrPC Section 160(1)'],
    actionSteps: [
      'Politely point out the requirement for a Judicial Magistrate order if detained at night.',
      'Demand presence of a female police officer.',
      'Call the Women Emergency Hotline (1091).'
    ]
  },
  {
    id: 'leg-3',
    title: 'Rights of Elderly & Differently Abled Persons',
    category: 'Senior Citizens & Disability',
    summary: 'Equal access, non-discrimination, priority police support, and elder abuse protection laws.',
    keyRights: [
      'RPwD Act guarantees barrier-free emergency assistance and priority medical response.',
      'Senior Citizens Act permits swift maintenance & protection orders against harassment.',
      'Right to dedicated accessibility accommodations in public facilities.'
    ],
    statutes: ['RPwD Act 2016 Section 7 & 8', 'Senior Citizens Protection Act 2007'],
    actionSteps: [
      'Notify emergency responders of specific mobility/braille/medical needs.',
      'Access local Senior Citizen Police Cell helpline.'
    ]
  },
  {
    id: 'leg-4',
    title: 'Good Samaritan & Bystander Protection',
    category: 'Bystander Protection',
    summary: 'Bystanders assisting accident victims or individuals in danger are legally protected from police harassment or compulsory court visits.',
    keyRights: [
      'No bystander can be forced to reveal their name, address, or identity.',
      'Hospitals cannot delay emergency medical treatment pending police formalities.',
      'Bystanders cannot be detained or questioned repeatedly.'
    ],
    statutes: ['Motor Vehicles Amendment Act Section 134A', 'Supreme Court Good Samaritan Guidelines'],
    actionSteps: [
      'Provide immediate help without fear of legal liability.',
      'Decline providing personal identity details if preferred.'
    ]
  }
];

export const EMERGENCY_HOTLINES = [
  { name: 'National Emergency Helpline', number: '112', desc: 'All-in-one Police, Fire & Medical dispatch' },
  { name: 'Women Helpline', number: '1091', desc: '24/7 dedicated distress & safety line' },
  { name: 'Ambulance & Medical Emergency', number: '102 / 911', desc: 'Immediate trauma & medical transport' },
  { name: 'Senior Citizen Helpline', number: '14567', desc: 'Dedicated elder safety & assistance' },
  { name: 'Disability Emergency Cell', number: '1800-11-2011', desc: 'Accessible support & disaster aid' },
  { name: 'Cyber Crime & Stalking Helpline', number: '1930', desc: 'Reporting harassment & online threats' },
];
