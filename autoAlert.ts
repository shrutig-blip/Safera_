/**
 * autoAlert.ts
 *
 * Automatic emergency messages for Safera.
 *
 *  POST /api/alert/trigger             send now (SOS, fall detected, inactivity)
 *  POST /api/alert/checkin/start       "message my contacts if I don't check in"
 *  POST /api/alert/checkin/:id/safe    I'm safe - cancel
 *  POST /api/alert/checkin/:id/extend  need more time
 *  GET  /api/alert/checkin/:id         status
 *  GET  /api/alert/config              which channels are live (for the UI)
 *
 * Channels (each optional, configured by env): Twilio SMS, Twilio WhatsApp,
 * Telegram bot. With none configured the module runs in dry-run mode and just
 * logs the message, so the demo never crashes.
 *
 * Caveat: check-in timers live in server memory (like your live-location
 * sessions). A Render free instance that sleeps or redeploys loses them, so the
 * client should ALSO run its own countdown and call /trigger as a second line
 * of defence.
 */
import crypto from 'crypto';
import type { Express, Request, Response } from 'express';

export type AlertReason = 'sos' | 'fall' | 'inactivity' | 'missed-checkin';

export interface Contact {
  name?: string;
  phone?: string; // E.164, e.g. +919876543210 -> SMS
  whatsapp?: string; // E.164 -> WhatsApp
  telegramChatId?: string;
}

interface AlertInput {
  name: string;
  reason: AlertReason;
  lat?: number | null;
  lng?: number | null;
  liveViewUrl?: string; // the public live-location viewer link Safera already generates
  evidenceUrl?: string; // an /e/<token> share link from cloudinaryEvidence.ts
  contacts: Contact[];
}

export interface AlertDeps {
  /** Return the freshest position for a live-location session, if any. */
  getLiveLocation?: (sessionId: string) => { lat: number; lng: number } | undefined;
}

const REASON_TEXT: Record<AlertReason, string> = {
  sos: 'pressed the SOS button',
  fall: 'may have fallen or been shaken violently',
  inactivity: 'has been unresponsive',
  'missed-checkin': 'did not check in when expected',
};

const PHONE_RE = /^\+[1-9][0-9]{7,14}$/;
const MAX_CONTACTS = 5;

// ------------------------------------------------------------ rate limit --
const hits = new Map<string, number[]>();
function rateLimited(req: Request, bucket: string, max: number, windowMs = 10 * 60 * 1000): boolean {
  const key = `${bucket}:${req.ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

// -------------------------------------------------------------- channels --
async function sendTwilio(to: string, body: string, whatsapp: boolean): Promise<void> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = whatsapp ? process.env.TWILIO_WHATSAPP_FROM : process.env.TWILIO_SMS_FROM;
  if (!sid || !token || !from) throw new Error(whatsapp ? 'WhatsApp not configured' : 'SMS not configured');

  const form = new URLSearchParams({
    To: whatsapp ? `whatsapp:${to}` : to,
    From: from.startsWith('whatsapp:') || !whatsapp ? from : `whatsapp:${from}`,
    Body: body,
  });
  const r = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: form,
  });
  if (!r.ok) throw new Error(`Twilio ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

async function sendTelegram(chatId: string, body: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Telegram not configured');
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: body, disable_web_page_preview: false }),
  });
  if (!r.ok) throw new Error(`Telegram ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

export function configuredChannels() {
  return {
    sms: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_SMS_FROM),
    whatsapp: Boolean(
      process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_WHATSAPP_FROM,
    ),
    telegram: Boolean(process.env.TELEGRAM_BOT_TOKEN),
    dryRun: process.env.ALERT_DRY_RUN === 'true',
  };
}

// --------------------------------------------------------------- message --
function buildMessage(a: AlertInput): string {
  const lines = [`SAFERA ALERT: ${a.name} ${REASON_TEXT[a.reason]}.`];
  if (typeof a.lat === 'number' && typeof a.lng === 'number') {
    lines.push(`Last location: https://maps.google.com/?q=${a.lat},${a.lng}`);
  }
  if (a.liveViewUrl) lines.push(`Live tracking: ${a.liveViewUrl}`);
  if (a.evidenceUrl) lines.push(`Evidence: ${a.evidenceUrl}`);
  lines.push(
    `Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })} IST`,
    'Please try to reach them now. If you cannot, call 112 (India emergency number).',
  );
  return lines.join('\n');
}

function cleanContacts(raw: unknown): Contact[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_CONTACTS)
    .map((c: any): Contact => ({
      name: typeof c?.name === 'string' ? c.name.slice(0, 60) : undefined,
      phone: typeof c?.phone === 'string' && PHONE_RE.test(c.phone) ? c.phone : undefined,
      whatsapp: typeof c?.whatsapp === 'string' && PHONE_RE.test(c.whatsapp) ? c.whatsapp : undefined,
      telegramChatId: typeof c?.telegramChatId === 'string' && /^-?\d{3,20}$/.test(c.telegramChatId) ? c.telegramChatId : undefined,
    }))
    .filter((c) => c.phone || c.whatsapp || c.telegramChatId);
}

interface DeliveryResult {
  contact: string;
  channel: 'sms' | 'whatsapp' | 'telegram' | 'dry-run';
  ok: boolean;
  error?: string;
}

export async function dispatchAlert(a: AlertInput): Promise<{ message: string; results: DeliveryResult[] }> {
  const message = buildMessage(a);
  const ch = configuredChannels();
  const results: DeliveryResult[] = [];
  const jobs: Promise<void>[] = [];

  const run = (contact: string, channel: DeliveryResult['channel'], fn: () => Promise<void>) =>
    jobs.push(
      fn().then(
        () => void results.push({ contact, channel, ok: true }),
        (e: Error) => void results.push({ contact, channel, ok: false, error: e.message }),
      ),
    );

  for (const c of a.contacts) {
    const label = c.name || 'contact';
    if (ch.dryRun || (!ch.sms && !ch.whatsapp && !ch.telegram)) {
      console.log(`[alert:dry-run] -> ${label}\n${message}`);
      results.push({ contact: label, channel: 'dry-run', ok: true });
      continue;
    }
    if (c.phone && ch.sms) run(label, 'sms', () => sendTwilio(c.phone!, message, false));
    if (c.whatsapp && ch.whatsapp) run(label, 'whatsapp', () => sendTwilio(c.whatsapp!, message, true));
    if (c.telegramChatId && ch.telegram) run(label, 'telegram', () => sendTelegram(c.telegramChatId!, message));
  }

  await Promise.all(jobs);
  return { message, results };
}

// -------------------------------------------------------------- check-ins --
interface CheckIn {
  id: string;
  name: string;
  dueAt: number;
  contacts: Contact[];
  lat: number | null;
  lng: number | null;
  liveSessionId?: string;
  liveViewUrl?: string;
  evidenceUrl?: string;
  status: 'active' | 'safe' | 'fired';
  timer: NodeJS.Timeout;
}

export function registerAutoAlertRoutes(app: Express, deps: AlertDeps = {}): void {
  const checkIns = new Map<string, CheckIn>();

  const publicView = (c: CheckIn) => ({ id: c.id, status: c.status, dueAt: new Date(c.dueAt).toISOString() });

  const fire = async (c: CheckIn) => {
    if (c.status !== 'active') return;
    c.status = 'fired';
    const live = c.liveSessionId ? deps.getLiveLocation?.(c.liveSessionId) : undefined;
    try {
      await dispatchAlert({
        name: c.name,
        reason: 'missed-checkin',
        lat: live?.lat ?? c.lat,
        lng: live?.lng ?? c.lng,
        liveViewUrl: c.liveViewUrl,
        evidenceUrl: c.evidenceUrl,
        contacts: c.contacts,
      });
    } catch (e) {
      console.error('[alert] missed check-in dispatch failed', e);
    }
  };

  app.get('/api/alert/config', (_req, res) => res.json(configuredChannels()));

  app.post('/api/alert/trigger', async (req: Request, res: Response) => {
    if (rateLimited(req, 'trigger', 5)) return res.status(429).json({ error: 'Too many alerts, slow down.' });
    const b = req.body || {};
    const reason: AlertReason = ['sos', 'fall', 'inactivity', 'missed-checkin'].includes(b.reason) ? b.reason : 'sos';
    const contacts = cleanContacts(b.contacts);
    if (!contacts.length) return res.status(400).json({ error: 'At least one valid contact is required' });

    try {
    const live = typeof b.liveSessionId === 'string' ? deps.getLiveLocation?.(b.liveSessionId) : undefined;
    const out = await dispatchAlert({
      name: typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 60) : 'A Safera user',
      reason,
      lat: live?.lat ?? (typeof b.lat === 'number' ? b.lat : null),
      lng: live?.lng ?? (typeof b.lng === 'number' ? b.lng : null),
      liveViewUrl: typeof b.liveViewUrl === 'string' ? b.liveViewUrl : undefined,
      evidenceUrl: typeof b.evidenceUrl === 'string' ? b.evidenceUrl : undefined,
      contacts,
    });
    return res.json({ delivered: out.results.filter((r) => r.ok).length, results: out.results });
    } catch (e: any) {
      console.error('[alert] trigger failed', e);
      return res.status(500).json({ error: e?.message || 'Alert failed' });
    }
  });

  app.post('/api/alert/checkin/start', (req: Request, res: Response) => {
    if (rateLimited(req, 'checkin', 10)) return res.status(429).json({ error: 'Too many check-ins, slow down.' });
    const b = req.body || {};
    const contacts = cleanContacts(b.contacts);
    if (!contacts.length) return res.status(400).json({ error: 'At least one valid contact is required' });
    // 10 s minimum keeps the live demo short; 8 h maximum.
    const durationSec = Math.min(Math.max(Number(b.durationSec) || 0, 10), 8 * 60 * 60);

    const id = crypto.randomUUID();
    const c: CheckIn = {
      id,
      name: typeof b.name === 'string' && b.name.trim() ? b.name.trim().slice(0, 60) : 'A Safera user',
      dueAt: Date.now() + durationSec * 1000,
      contacts,
      lat: typeof b.lat === 'number' ? b.lat : null,
      lng: typeof b.lng === 'number' ? b.lng : null,
      liveSessionId: typeof b.liveSessionId === 'string' ? b.liveSessionId : undefined,
      liveViewUrl: typeof b.liveViewUrl === 'string' ? b.liveViewUrl : undefined,
      evidenceUrl: typeof b.evidenceUrl === 'string' ? b.evidenceUrl : undefined,
      status: 'active',
      timer: setTimeout(() => void fire(c), durationSec * 1000),
    };
    checkIns.set(id, c);
    return res.status(201).json(publicView(c));
  });

  app.get('/api/alert/checkin/:id', (req, res) => {
    const c = checkIns.get(req.params.id);
    return c ? res.json(publicView(c)) : res.status(404).json({ error: 'Not found' });
  });

  app.post('/api/alert/checkin/:id/safe', (req, res) => {
    const c = checkIns.get(req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    if (c.status === 'active') {
      clearTimeout(c.timer);
      c.status = 'safe';
    }
    return res.json(publicView(c));
  });

  app.post('/api/alert/checkin/:id/extend', (req, res) => {
    const c = checkIns.get(req.params.id);
    if (!c) return res.status(404).json({ error: 'Not found' });
    if (c.status !== 'active') return res.status(409).json({ error: `Check-in already ${c.status}` });
    const addSec = Math.min(Math.max(Number(req.body?.addSec) || 0, 10), 2 * 60 * 60);
    clearTimeout(c.timer);
    c.dueAt += addSec * 1000;
    c.timer = setTimeout(() => void fire(c), Math.max(c.dueAt - Date.now(), 0));
    return res.json(publicView(c));
  });

  // Sweep finished check-ins so contact numbers don't sit in memory forever.
  setInterval(() => {
    for (const [id, c] of checkIns) {
      if (c.status !== 'active' && Date.now() - c.dueAt > 60 * 60 * 1000) checkIns.delete(id);
    }
  }, 10 * 60 * 1000).unref();
}