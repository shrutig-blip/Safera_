import express from 'express';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import dotenv from 'dotenv';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';

dotenv.config({ quiet: true });

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Bumped from 10mb to 50mb: encrypted evidence recordings (video/audio,
// base64-encoded — which inflates size ~33%) are sent as JSON bodies to
// /api/evidence/upload below, and 10mb was too small for more than a few
// seconds of footage.
app.use(express.json({ limit: '50mb' }));

// Helper to initialize Gemini SDK safely
function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// API Route: Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// API Route 1: Risk Assessment Prediction
//
// Produces a genuine structured safety report, not a one-line guess. Every
// field the client already has locally about this location — safetyScore,
// lightingStars, cctvPercent, policeDistanceMeters, recentSosCount,
// accessibility, and the nearest safe resource — is accepted here and fed
// into the prompt, so Gemini is reasoning over the same real numbers the
// rest of the app (the Gaussian-kernel risk grid in hotspot.ts) already
// computed, instead of guessing from just a place name and FIR count.
app.post('/api/ai/predict-risk', async (req, res) => {
  try {
    const {
      locationName,
      timeOfDay,
      weather,
      crowdDensity,
      firCount,
      recentReports,
      // Real per-location signals the client already has — optional so this
      // endpoint still degrades gracefully for older callers.
      safetyScore,
      lightingStars,
      cctvPercent,
      policeDistanceMeters,
      recentSosCount,
      wheelchairAccessible,
      policeBoothOnSite,
      nearestSafeResource, // { name: string, distanceMeters: number, reason: string } | null
    } = req.body;

    const hasRealSignals = typeof safetyScore === 'number';

    const ai = getGeminiClient();

    // Builds the same structured report shape from real numbers alone,
    // no LLM involved — used both when GEMINI_API_KEY is unset AND as the
    // last-resort object if Gemini's response fails to parse.
    const buildDataOnlyReport = () => {
      const score = hasRealSignals
        ? safetyScore
        : Math.max(35, 90 - (firCount || 0) * 8 - (timeOfDay === 'Night' || timeOfDay === 'Late Night' ? 20 : 0));

      const riskLevel =
        score >= 76 ? 'Safe' : score >= 51 ? 'Moderate Caution' : score >= 26 ? 'High Risk' : 'Extreme Caution';

      const lightingNote = hasRealSignals
        ? lightingStars >= 4
          ? 'Well-lit with strong streetlight coverage.'
          : lightingStars >= 2
          ? 'Moderately lit, with some dark patches after dusk.'
          : 'Poorly lit, with minimal working streetlights.'
        : `Assume ${timeOfDay === 'Day' ? 'good' : 'limited'} visibility — no logged lighting data for this spot.`;
      const lightingScore = hasRealSignals ? Math.round((lightingStars / 5) * 100) : timeOfDay === 'Day' ? 70 : 40;

      const cctvNote = hasRealSignals
        ? cctvPercent >= 80
          ? 'Extensive CCTV coverage.'
          : cctvPercent >= 40
          ? 'Partial CCTV coverage — some blind spots likely.'
          : 'Very limited CCTV coverage.'
        : 'No logged CCTV data for this spot.';
      const cctvScore = hasRealSignals ? cctvPercent : 50;

      const policeNote = hasRealSignals
        ? policeDistanceMeters <= 300
          ? `Active police presence just ${policeDistanceMeters}m away.`
          : policeDistanceMeters <= 700
          ? `Nearest police booth is ${policeDistanceMeters}m away.`
          : `No nearby police booth — closest is ${policeDistanceMeters}m away.`
        : 'No logged police-distance data for this spot.';
      const policeScore = hasRealSignals ? Math.max(0, 100 - Math.round(policeDistanceMeters / 15)) : 50;

      const incidentNote = hasRealSignals
        ? `${firCount || 0} FIR incident(s) and ${recentSosCount || 0} recent SOS trigger(s) logged nearby.`
        : `${firCount || 0} incident(s) reported in the surrounding area.`;
      const incidentScore = Math.max(0, 100 - (firCount || 0) * 10 - (recentSosCount || 0) * 15);

      const crowdNote = `${crowdDensity || 'Moderate'} pedestrian traffic${
        timeOfDay === 'Night' || timeOfDay === 'Late Night' ? ', which thins out further after dark.' : '.'
      }`;

      const summary = `${locationName || 'This location'} is currently rated "${riskLevel}" (${score}/100) at ${
        timeOfDay || 'this time'
      }. ${lightingNote} ${policeNote}${
        !ai ? ' (Live AI analysis is temporarily unavailable — this report is generated directly from logged location data.)' : ''
      }`;

      const timeContext =
        timeOfDay === 'Night' || timeOfDay === 'Late Night'
          ? `After dark, lighting and police proximity matter more than during the day — ${
              hasRealSignals && lightingStars <= 2 ? 'and this spot is a known weak point on lighting.' : 'factor that in before walking alone.'
            }`
          : `During ${timeOfDay || 'the day'}, visibility and foot traffic are the biggest safety factors here, not lighting.`;

      const recommendedActions = [
        score < 51
          ? 'Avoid this area alone, especially after dark — take a longer but better-lit route if possible.'
          : 'Standard precautions apply — stay aware of your surroundings.',
        wheelchairAccessible === false
          ? 'No confirmed step-free access here — plan an alternate path if that matters for your trip.'
          : 'Stick to the main walkway rather than side lanes or shortcuts.',
        'Share your live location with a trusted contact before entering this zone.',
      ];

      const nearbySafeResourceNote = nearestSafeResource
        ? `${nearestSafeResource.name} is the closest safe resource${
            nearestSafeResource.reason === 'police-booth' ? ' with an active police booth' : ''
          }, about ${
            nearestSafeResource.distanceMeters >= 1000
              ? `${(nearestSafeResource.distanceMeters / 1000).toFixed(1)} km`
              : `${Math.round(nearestSafeResource.distanceMeters)} m`
          } away.`
        : 'No verified safe resource is logged near this location yet.';

      return {
        safetyScore: score,
        riskLevel,
        summary,
        riskBreakdown: [
          { factor: 'Lighting', score: lightingScore, note: lightingNote },
          { factor: 'CCTV Coverage', score: cctvScore, note: cctvNote },
          { factor: 'Police Proximity', score: policeScore, note: policeNote },
          { factor: 'Incident History', score: incidentScore, note: incidentNote },
          { factor: 'Crowd & Foot Traffic', score: crowdDensity === 'High' ? 75 : crowdDensity === 'Low' ? 35 : 55, note: crowdNote },
        ],
        timeContext,
        recommendedActions,
        nearbySafeResourceNote,
      };
    };

    if (!ai) {
      return res.json(buildDataOnlyReport());
    }

    const prompt = `You are a personal-safety risk analyst. Write a genuinely detailed, specific safety report for a pedestrian at this exact location — not generic advice. Ground every claim in the real data below; do not invent statistics that aren't given.

Location: "${locationName || 'Urban Corridor'}"
Time of day: ${timeOfDay || 'Evening'}
Weather: ${weather || 'Clear'}
Crowd Density: ${crowdDensity || 'Moderate'}
Logged FIR/incident count: ${firCount ?? 'unknown'}
Recent SOS triggers nearby: ${recentSosCount ?? 'unknown'}
Overall computed safety score for this spot: ${hasRealSignals ? `${safetyScore}/100` : 'not available'}
Lighting rating: ${typeof lightingStars === 'number' ? `${lightingStars}/5 stars` : 'not available'}
CCTV coverage: ${typeof cctvPercent === 'number' ? `${cctvPercent}%` : 'not available'}
Distance to nearest police booth: ${typeof policeDistanceMeters === 'number' ? `${policeDistanceMeters}m` : 'not available'}
Wheelchair / step-free access confirmed: ${wheelchairAccessible === undefined ? 'unknown' : wheelchairAccessible ? 'yes' : 'no'}
Police booth on site: ${policeBoothOnSite === undefined ? 'unknown' : policeBoothOnSite ? 'yes' : 'no'}
Nearest verified safe resource: ${nearestSafeResource ? `${nearestSafeResource.name}, ${Math.round(nearestSafeResource.distanceMeters)}m away (${nearestSafeResource.reason})` : 'none logged'}
Recent community reports: ${JSON.stringify(recentReports || [])}

Return a clean JSON object ONLY, matching this exact schema:
{
  "safetyScore": <number 0-100, 100 = safest — should track the computed score above if given>,
  "riskLevel": "<Safe | Moderate Caution | High Risk | Extreme Caution>",
  "summary": "<2-3 sentence executive summary citing specific numbers from above (not vague generalities)>",
  "riskBreakdown": [
    { "factor": "Lighting", "score": <0-100>, "note": "<one specific sentence>" },
    { "factor": "CCTV Coverage", "score": <0-100>, "note": "<one specific sentence>" },
    { "factor": "Police Proximity", "score": <0-100>, "note": "<one specific sentence>" },
    { "factor": "Incident History", "score": <0-100>, "note": "<one specific sentence citing FIR/SOS counts>" },
    { "factor": "Crowd & Foot Traffic", "score": <0-100>, "note": "<one specific sentence>" }
  ],
  "timeContext": "<1-2 sentences on how THIS specific time of day changes the risk here>",
  "recommendedActions": ["<specific action 1>", "<specific action 2>", "<specific action 3>"],
  "nearbySafeResourceNote": "<1 sentence pointing to the nearest safe resource given above, or noting none is logged>"
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    let parsed: any;
    try {
      parsed = JSON.parse(response.text || '{}');
      if (typeof parsed.safetyScore !== 'number' || typeof parsed.summary !== 'string' || !parsed.summary.trim()) {
        throw new Error('Gemini response missing required fields');
      }
    } catch (parseErr) {
      console.error('predict-risk: Gemini response malformed, using data-only report instead', parseErr);
      parsed = buildDataOnlyReport();
    }

    return res.json(parsed);
  } catch (error: any) {
    console.error('Error in predict-risk:', error);
    return res.status(500).json({ error: error.message || 'Failed to predict risk' });
  }
});

// API Route 2: Dynamic Safest & Accessible Route Analysis
app.post('/api/ai/analyze-route', async (req, res) => {
  try {
    const { origin, destination, timeOfDay, transportMode, accessibilityNeeds } = req.body;
    const ai = getGeminiClient();

    if (!ai) {
      return res.json({
        routes: [
          {
            id: 'route-safest',
            name: 'GuardIA Safest & Well-Lit Route',
            tag: 'Recommended for Night / Solo',
            distance: '2.4 km',
            estimatedTime: '18 mins',
            safetyScore: 92,
            accessibilityScore: 88,
            lightingPercent: 95,
            cctvCoverage: 85,
            policeBoothNearby: true,
            highlights: ['Main Avenue lighting', 'Passes 2 Police Booths', 'Step-free sidewalks'],
            riskSegments: ['Minor darkness near Metro exit (100m) - Stay on east sidewalk']
          },
          {
            id: 'route-accessible',
            name: '100% Accessible Step-Free Route',
            tag: 'Wheelchair & Elderly Friendly',
            distance: '2.6 km',
            estimatedTime: '21 mins',
            safetyScore: 89,
            accessibilityScore: 98,
            lightingPercent: 90,
            cctvCoverage: 80,
            policeBoothNearby: true,
            highlights: ['Zero steps or high curbs', 'Tactile paving & broad ramps', 'Accessible washroom on route'],
            riskSegments: ['Crosswalk signal duration is brief (15s) at 3rd Junction']
          },
          {
            id: 'route-fastest',
            name: 'Direct Shortest Route',
            tag: 'Fastest - Exercise Caution',
            distance: '1.9 km',
            estimatedTime: '14 mins',
            safetyScore: 68,
            accessibilityScore: 60,
            lightingPercent: 55,
            cctvCoverage: 40,
            policeBoothNearby: false,
            highlights: ['Shortest walking distance'],
            riskSegments: ['Narrow alleyway with poor lighting', 'Steep curb without ramp near Market rear']
          }
        ]
      });
    }

    const prompt = `You are an expert safety and accessibility route analyzer.
    Analyze travel from "${origin || 'Central Station'}" to "${destination || 'Community Center'}" at time "${timeOfDay || 'Night'}".
    Transport Mode: ${transportMode || 'Walking'}.
    User Accessibility Needs: ${accessibilityNeeds || 'Elderly / Wheelchair access'}.

    Generate 3 distinct route options in JSON format matching this exact schema:
    {
      "routes": [
        {
          "id": "string",
          "name": "string",
          "tag": "string",
          "distance": "string",
          "estimatedTime": "string",
          "safetyScore": number (0-100),
          "accessibilityScore": number (0-100),
          "lightingPercent": number (0-100),
          "cctvCoverage": number (0-100),
          "policeBoothNearby": boolean,
          "highlights": ["string"],
          "riskSegments": ["string"]
        }
      ]
    }`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error in analyze-route:', error);
    return res.status(500).json({ error: error.message || 'Failed to analyze route' });
  }
});

// API Route 3: AI Legal Rights Advisor
app.post('/api/ai/legal-rights', async (req, res) => {
  try {
    const { query, category } = req.body;
    const ai = getGeminiClient();

    if (!ai) {
      return res.json({
        topic: category || 'General Rights',
        summary: 'Under Indian & Global laws, you have fundamental legal protections during emergency situations.',
        keyRights: [
          'Zero FIR Rule: You can file a First Information Report (FIR) at ANY police station regardless of jurisdiction.',
          'Right to Free Legal Aid: You have an absolute legal right to demand free legal representation.',
          'Protection for Women at Night: Female citizens cannot be arrested between sunset and sunrise except under extraordinary court orders by a magistrate.'
        ],
        actionSteps: [
          'Request the police officer’s badge number and station ID.',
          'Send your GuardIA live tracking link and recorded evidence to trusted contacts.',
          'Ask for a copy of the written FIR or complaint receipt free of cost.'
        ],
        legalStatutes: ['CrPC Section 154 (Zero FIR)', 'Article 39A (Free Legal Aid)', 'POSH Act Section 9'],
        // Real, verifiable government sources for these specific statutes —
        // not generated by the model, so they stay accurate even when the
        // Gemini key isn't configured.
        sources: [
          { label: 'NCW — Laws Relating to Women (booklet)', url: 'https://cdn.ncw.gov.in/wp-content/uploads/2023/01/Booklet-Laws-relating-to-Women_0.pdf' },
          { label: 'India Code — Code of Criminal Procedure', url: 'https://www.indiacode.nic.in/handle/123456789/1611' },
        ],
      });
    }

    const prompt = `You are GuardIA Legal Rights Advisor, an AI legal assistant specializing in safety laws, emergency protection, women's rights, rights of senior citizens, differently-abled persons rights (RPwD), police encounter procedures, Zero FIR, and bystander protection laws.

    User Query/Topic: "${query || 'What are my rights if I am harassed or stopped by police at night?'}"
    Category context: "${category || 'Emergency Rights'}"

    Provide a concise, highly practical legal advice response in JSON format matching:
    {
      "topic": "string",
      "summary": "1-2 sentence overview of user's core legal standing",
      "keyRights": ["Clear point 1", "Clear point 2", "Clear point 3"],
      "actionSteps": ["Step 1", "Step 2", "Step 3"],
      "legalStatutes": ["Statute/Act 1", "Statute/Act 2"],
      "sources": [
        { "label": "Name of the official source (e.g. an NCW booklet, an India Code Act page, a WCD scheme page)", "url": "A real, verifiable URL to an official Indian government source (ncw.gov.in, indiacode.nic.in, wcd.gov.in, cybercrime.gov.in) that supports the statutes cited above" }
      ]
    }

    IMPORTANT: only include a source in "sources" if you are confident the URL is real and correct. If you are not certain of an exact URL, name the official body and document instead (e.g. "National Commission for Women — Laws Relating to Women booklet") and omit the "url" field for that entry rather than inventing a link.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.6-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
      }
    });

    const parsed = JSON.parse(response.text || '{}');
    return res.json(parsed);
  } catch (error: any) {
    console.error('Error in legal-rights:', error);
    return res.status(500).json({ error: error.message || 'Failed to consult legal advisor' });
  }
});

// API Route 4: AI Safety Companion Mode ("Walk With Me")
app.post('/api/ai/companion-chat', async (req, res) => {
  try {
    const { userMessage, history, currentLocation, userStatus } = req.body;
    const ai = getGeminiClient();

    if (!ai) {
      return res.json({
        reply: `I'm with you! I'm keeping an eye on your journey through ${currentLocation || 'your route'}. Let me know if you see any dark spots or feel uneasy.`,
        suggestedCheckInSec: 180,
        comfortLevel: 'reassuring',
        alertLevel: 'normal'
      });
    }

    const systemInstruction = `You are GuardIA Companion ("Walk With Me"), a calm, supportive, vigilant real-time AI companion walking with the user.
    Your job is to talk with the user in short, empathetic sentences (1-3 sentences max).
    If they express fear or unease, offer clear calm guidance, remind them of nearby police/safe spots, and ask if they want to prime an SOS trigger.
    Current user location context: "${currentLocation || 'Walking home'}". User status: "${userStatus || 'Moving normally'}".`;

    const chat = ai.chats.create({
      model: 'gemini-3.6-flash',
      config: {
        systemInstruction,
      },
    });

    // Send history if provided or simple query
    const response = await chat.sendMessage({
      message: userMessage || "I'm walking through a dark street right now."
    });

    return res.json({
      reply: response.text || "I'm right here with you. Keep moving towards the main street. I'm monitoring your safety countdown.",
      suggestedCheckInSec: userMessage?.toLowerCase().includes('scared') || userMessage?.toLowerCase().includes('dark') ? 60 : 180,
      comfortLevel: 'reassuring',
      alertLevel: userMessage?.toLowerCase().includes('following') ? 'caution' : 'normal'
    });
  } catch (error: any) {
    console.error('Error in companion-chat:', error);
    return res.status(500).json({ error: error.message || 'Companion chat failed' });
  }
});

// In-memory Live Location session store
// NOTE: this resets on server restart and isn't shared across multiple server instances.
// For production, back this with a real database (e.g. Redis/Postgres) instead.
interface LiveLocationSession {
  id: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  label: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

const LIVE_SESSION_TTL_MS = 2 * 60 * 60 * 1000; // sessions auto-expire after 2 hours
const liveLocationSessions = new Map<string, LiveLocationSession>();

function isSessionExpired(session: LiveLocationSession) {
  return Date.now() - session.createdAt > LIVE_SESSION_TTL_MS;
}

// Periodically sweep expired sessions so memory doesn't grow unbounded
setInterval(() => {
  for (const [id, session] of liveLocationSessions) {
    if (isSessionExpired(session)) liveLocationSessions.delete(id);
  }
}, 5 * 60 * 1000);

// API Route: Start a Live Location sharing session
app.post('/api/live-location/start', (req, res) => {
  const { lat, lng, accuracy, label } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat and lng (numbers) are required' });
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const session: LiveLocationSession = {
    id,
    lat,
    lng,
    accuracy: typeof accuracy === 'number' ? accuracy : null,
    label: typeof label === 'string' && label.trim() ? label.trim() : 'Safera User',
    active: true,
    createdAt: now,
    updatedAt: now,
  };
  liveLocationSessions.set(id, session);
  return res.status(201).json(session);
});

// API Route: Push a new position update for an active session
app.post('/api/live-location/:id/update', (req, res) => {
  const session = liveLocationSessions.get(req.params.id);
  if (!session || isSessionExpired(session)) {
    return res.status(404).json({ error: 'Live location session not found or expired' });
  }
  if (!session.active) {
    return res.status(410).json({ error: 'Live location session has been stopped' });
  }

  const { lat, lng, accuracy } = req.body || {};
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return res.status(400).json({ error: 'lat and lng (numbers) are required' });
  }

  session.lat = lat;
  session.lng = lng;
  session.accuracy = typeof accuracy === 'number' ? accuracy : session.accuracy;
  session.updatedAt = Date.now();
  return res.json(session);
});

// API Route: Fetch the current state of a session (used by the public viewer page)
app.get('/api/live-location/:id', (req, res) => {
  const session = liveLocationSessions.get(req.params.id);
  if (!session || isSessionExpired(session)) {
    return res.status(404).json({ error: 'Live location session not found or expired' });
  }
  return res.json(session);
});

// API Route: Stop sharing a session
app.post('/api/live-location/:id/stop', (req, res) => {
  const session = liveLocationSessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'Live location session not found' });
  }
  session.active = false;
  session.updatedAt = Date.now();
  return res.json(session);
});

// Encrypted Evidence Vault storage
//
// The client (useEvidenceRecorder.ts) encrypts every recording with
// AES-256-GCM in the browser via Web Crypto BEFORE it ever reaches this
// endpoint — this server only ever stores ciphertext + an IV + a SHA-256
// hash of the plaintext (for later tamper-proofing). It has no way to
// decrypt what it stores; only whoever holds the client-side vault key
// (currently: the same device, via localStorage — see evidenceCrypto.ts
// for the noted limitation) can.
const EVIDENCE_DIR = path.join(process.cwd(), 'evidence-storage');
if (!fs.existsSync(EVIDENCE_DIR)) {
  fs.mkdirSync(EVIDENCE_DIR, { recursive: true });
}

interface EvidenceRecord {
  id: string;
  fileName: string;
  mimeType: string;
  sha256Hash: string;
  capturedAt: string;
  lat: number | null;
  lng: number | null;
  storedAt: string;
}

// In-memory index — resets on server restart, same caveat as the
// liveLocationSessions map above. Swap for a real database/table (and
// swap the fs.writeFileSync calls below for S3/GCS/Azure Blob) before
// this goes to production.
const evidenceIndex = new Map<string, EvidenceRecord>();

app.post('/api/evidence/upload', (req, res) => {
  try {
    const { fileName, mimeType, encryptedBase64, ivBase64, sha256Hash, capturedAt, lat, lng } = req.body || {};

    if (typeof encryptedBase64 !== 'string' || typeof ivBase64 !== 'string' || typeof sha256Hash !== 'string') {
      return res.status(400).json({ error: 'encryptedBase64, ivBase64 and sha256Hash (strings) are required' });
    }

    const id = crypto.randomUUID();
    const cipherBuffer = Buffer.from(encryptedBase64, 'base64');
    fs.writeFileSync(path.join(EVIDENCE_DIR, `${id}.enc`), cipherBuffer);
    fs.writeFileSync(path.join(EVIDENCE_DIR, `${id}.iv`), Buffer.from(ivBase64, 'base64'));

    const record: EvidenceRecord = {
      id,
      fileName: typeof fileName === 'string' ? fileName : `evidence-${id}.enc`,
      mimeType: typeof mimeType === 'string' ? mimeType : 'video/webm',
      sha256Hash,
      capturedAt: typeof capturedAt === 'string' ? capturedAt : new Date().toISOString(),
      lat: typeof lat === 'number' ? lat : null,
      lng: typeof lng === 'number' ? lng : null,
      storedAt: new Date().toISOString(),
    };
    evidenceIndex.set(id, record);

    return res.status(201).json({ id, sizeBytes: cipherBuffer.length, storedAt: record.storedAt });
  } catch (error: any) {
    console.error('Error in evidence upload:', error);
    return res.status(500).json({ error: error.message || 'Evidence upload failed' });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GuardIA Safety Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();