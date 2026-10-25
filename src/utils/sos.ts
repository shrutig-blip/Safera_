import { EmergencyContact } from '../types';

const LAST_KNOWN_LOCATION_KEY = 'safera:last-known-location';

export interface SosCoords {
  lat: number;
  lng: number;
  accuracy: number | null;
  timestamp: number;
}

/** Reads the last GPS fix we cached locally. Works with zero network. */
export function getCachedLocation(): SosCoords | null {
  try {
    const raw = localStorage.getItem(LAST_KNOWN_LOCATION_KEY);
    return raw ? (JSON.parse(raw) as SosCoords) : null;
  } catch {
    return null;
  }
}

function cacheLocation(coords: SosCoords) {
  try {
    localStorage.setItem(LAST_KNOWN_LOCATION_KEY, JSON.stringify(coords));
  } catch {
    // localStorage can throw in private/incognito modes — non-fatal, just skip caching
  }
}

/**
 * Gets a fresh GPS fix when possible, caching it for later. If geolocation
 * fails or times out (weak/no signal — common exactly when you need SOS
 * most), falls back to the last fix we have cached, so an SOS triggered in
 * a dead zone still carries a real position instead of nothing.
 */
export function getBestEffortLocation(timeoutMs = 8000): Promise<SosCoords | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(getCachedLocation());
      return;
    }

    let settled = false;
    const finish = (coords: SosCoords | null) => {
      if (settled) return;
      settled = true;
      resolve(coords);
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords: SosCoords = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: Date.now(),
        };
        cacheLocation(coords);
        finish(coords);
      },
      () => finish(getCachedLocation()),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
    );

    // Safety net in case getCurrentPosition never calls back at all
    window.setTimeout(() => finish(getCachedLocation()), timeoutMs + 500);
  });
}

export function buildSosMessage(coords: SosCoords | null, liveUrl?: string) {
  const locationLine = coords
    ? `Location: https://www.google.com/maps?q=${coords.lat},${coords.lng}`
    : 'Location: unavailable right now';
  const staleness =
    coords && Date.now() - coords.timestamp > 60_000
      ? ' (last known, may be outdated)'
      : '';
  const liveLine = liveUrl ? `\nLive tracking: ${liveUrl}` : '';
  return `EMERGENCY SOS from Safera. I need help. ${locationLine}${staleness}${liveLine}`;
}

/** Contacts who've opted in to SMS alerts and have a usable number. */
export function smsEligibleContacts(contacts: EmergencyContact[]) {
  return contacts.filter((c) => c.sendSms && c.phone?.trim());
}

/**
 * Builds one sms: link per contact. Mobile browsers (Android especially)
 * only reliably support a single recipient per sms: URI, so rather than a
 * comma-joined multi-recipient link that can silently drop contacts, this
 * returns one link per contact for the UI to render as individual buttons.
 * `?&body=` (not just `?body=`) is used because some iOS Safari versions
 * require the extra `&` when a recipient is already present in the URI.
 */
export function buildSmsLinks(contacts: EmergencyContact[], message: string) {
  const body = encodeURIComponent(message);
  return smsEligibleContacts(contacts).map((c) => ({
    contact: c,
    href: `sms:${c.phone.replace(/\s+/g, '')}?&body=${body}`,
  }));
}