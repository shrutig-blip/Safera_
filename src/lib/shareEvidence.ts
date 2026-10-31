import { EvidenceItem } from '../types';

export interface ShareEvidenceParams {
  item: EvidenceItem;
  ttlMinutes: number;
  blurFaces: boolean;
}

export interface ShareEvidenceResult {
  id: string;
  kind: 'image' | 'video' | 'audio';
  link: string;
  thumbnailLink?: string;
  expiresAt: string;
  facesBlurred: boolean;
}

const MAX_SHARE_BYTES = 35 * 1024 * 1024; // 35 MB limit

/**
 * Converts a Blob to raw base64 string (without the "data:...;base64," prefix).
 * Uses FileReader to avoid stack overflow on larger blobs.
 */
function blobToRawBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result;
      if (typeof res === 'string') {
        const commaIndex = res.indexOf(',');
        resolve(commaIndex !== -1 ? res.slice(commaIndex + 1) : res);
      } else {
        reject(new Error('Failed to convert file to base64.'));
      }
    };
    reader.onerror = () => {
      reject(reader.error || new Error('Failed to read file for sharing.'));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Shares an unencrypted copy of an evidence item recorded in the current session.
 */
export async function shareEvidence({
  item,
  ttlMinutes,
  blurFaces,
}: ShareEvidenceParams): Promise<ShareEvidenceResult> {
  if (!item.mediaUrl || !item.mediaUrl.startsWith('blob:')) {
    throw new Error('Only evidence recorded in this session can be shared. Older items are encrypted on the server.');
  }

  // 1. Fetch the plaintext Blob from the session's object URL
  let blob: Blob;
  try {
    const res = await fetch(item.mediaUrl);
    if (!res.ok) {
      throw new Error('Could not access media file for sharing.');
    }
    blob = await res.blob();
  } catch (err: unknown) {
    if (err instanceof Error) throw err;
    throw new Error('Failed to access recording file.');
  }

  // 2. Size check
  if (blob.size > MAX_SHARE_BYTES) {
    throw new Error('This file is too large to share (max about 35 MB). Try a shorter recording.');
  }

  // 3. Resolve and normalize MIME type (strip codec parameters)
  let mimeType = (blob.type || '').split(';')[0].trim().toLowerCase();
  if (item.type === 'audio' && mimeType.startsWith('video/')) {
    mimeType = 'audio/webm';
  } else if (item.type === 'photo' && !mimeType) {
    mimeType = 'image/jpeg';
  } else if (!mimeType) {
    if (item.type === 'video') mimeType = 'video/webm';
    else if (item.type === 'audio') mimeType = 'audio/webm';
    else mimeType = 'image/jpeg';
  }

  // 4. Resolve capturedAt timestamp
  let capturedAt: string;
  try {
    const parsed = new Date(item.timestamp);
    capturedAt = isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
  } catch {
    capturedAt = new Date().toISOString();
  }

  // 5. Coordinates: send null when coordinates are {0, 0}
  const lat = item.coords && (item.coords.lat !== 0 || item.coords.lng !== 0) ? item.coords.lat : null;
  const lng = item.coords && (item.coords.lat !== 0 || item.coords.lng !== 0) ? item.coords.lng : null;

  // 6. Convert to raw base64
  const rawBase64 = await blobToRawBase64(blob);

  // 7. POST to /api/evidence/share
  const response = await fetch('/api/evidence/share', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: item.title,
      mimeType,
      base64: rawBase64,
      capturedAt,
      lat,
      lng,
      blurFaces: item.type === 'photo' ? Boolean(blurFaces) : false,
      ttlMinutes,
    }),
  });

  if (response.status === 404) {
    throw new Error('Sharing needs cloud storage to be enabled on the server.');
  }

  let data: any = null;
  try {
    data = await response.json();
  } catch {
    // Ignore JSON parse error if response body is non-JSON HTML error
  }

  if (!response.ok) {
    const errorMsg = data?.error || `Share failed with status ${response.status}`;
    throw new Error(errorMsg);
  }

  if (!data || typeof data.link !== 'string') {
    throw new Error('Invalid response received from server.');
  }

  return data as ShareEvidenceResult;
}

