/**
 * Auto-share of SOS evidence.
 * 1) uploads a playable copy of what has been recorded so far to Cloudinary
 *    (same /api/evidence/share used by the manual Share button)
 * 2) asks the server to VERIFY the link opens, then to text it to the contacts
 *    (/api/alert/evidence).
 */
const MAX_SHARE_BYTES = 35 * 1024 * 1024;

export interface SosEvidenceContact {
  name?: string;
  phone?: string;
  telegramChatId?: string;
}

export interface SosEvidenceResult {
  link: string;
  accessible: boolean;
  delivered: number;
  error?: string;
}

function blobToRawBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result;
      if (typeof res !== 'string') return reject(new Error('Could not read recording'));
      const i = res.indexOf(',');
      resolve(i !== -1 ? res.slice(i + 1) : res);
    };
    reader.onerror = () => reject(reader.error || new Error('Could not read recording'));
    reader.readAsDataURL(blob);
  });
}

export async function shareSosEvidenceSnapshot(params: {
  blob: Blob;
  kind: 'video' | 'audio';
  part: number;
  coords: { lat: number; lng: number } | null;
  contacts: SosEvidenceContact[];
  name?: string;
}): Promise<SosEvidenceResult> {
  const { blob, kind, part, coords, contacts, name } = params;
  if (blob.size < 2048) throw new Error('Recording is still too short to share.');
  if (blob.size > MAX_SHARE_BYTES) throw new Error('Recording is too large to share automatically (35 MB max).');

  const mimeType =
    kind === 'audio' ? 'audio/webm' : (blob.type || 'video/webm').split(';')[0].trim().toLowerCase() || 'video/webm';

  const shareRes = await fetch('/api/evidence/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: `SOS evidence update ${part}`,
      mimeType,
      base64: await blobToRawBase64(blob),
      capturedAt: new Date().toISOString(),
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      blurFaces: false,
      ttlMinutes: 24 * 60,
    }),
  });
  const shareData: any = await shareRes.json().catch(() => null);
  if (shareRes.status === 404) throw new Error('Cloud storage is not enabled on the server.');
  if (!shareRes.ok || typeof shareData?.link !== 'string') {
    throw new Error(shareData?.error || `Evidence upload failed (HTTP ${shareRes.status})`);
  }

  const alertRes = await fetch('/api/alert/evidence', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: name || 'A Safera user',
      evidenceUrl: shareData.link,
      part,
      lat: coords?.lat,
      lng: coords?.lng,
      contacts,
    }),
  });
  const alertData: any = await alertRes.json().catch(() => null);
  if (!alertRes.ok) throw new Error(alertData?.error || `Evidence alert failed (HTTP ${alertRes.status})`);

  return {
    link: shareData.link,
    accessible: Boolean(alertData?.accessible),
    delivered: Number(alertData?.delivered) || 0,
    error: alertData?.error,
  };
}
