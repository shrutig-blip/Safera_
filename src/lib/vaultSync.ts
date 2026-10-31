import { EvidenceItem } from '../types';
import { getMyEvidenceIds } from './vaultIndex';
import { getExistingVaultKey, decryptBlob } from './evidenceCrypto';

const MAX_CIPHERTEXT_BYTES = 47 * 1024 * 1024; // 47 MB download limit

interface CloudVaultRecord {
  id: string;
  fileName?: string;
  mimeType: string;
  sha256Hash: string;
  ivBase64: string;
  capturedAt?: string;
  storedAt?: string;
  lat?: number | null;
  lng?: number | null;
  sizeBytes: number;
  downloadUrl?: string;
}

/**
 * Fetches encrypted evidence records stored on the server that were uploaded
 * by this device (scoped to getMyEvidenceIds()).
 * Returns an empty array without throwing if Cloudinary is not configured or offline.
 */
export async function fetchCloudItems(): Promise<EvidenceItem[]> {
  try {
    const res = await fetch('/api/evidence/vault');
    if (!res.ok) return [];

    const data = await res.json().catch(() => null);
    if (!data || !Array.isArray(data.items)) return [];

    const myIds = new Set(getMyEvidenceIds());
    const matched: CloudVaultRecord[] = data.items.filter(
      (rec: any) => rec && typeof rec.id === 'string' && myIds.has(rec.id)
    );

    // Keep ordering newest-first within cloud items
    matched.sort((a, b) => {
      const timeA = new Date(a.capturedAt || a.storedAt || 0).getTime();
      const timeB = new Date(b.capturedAt || b.storedAt || 0).getTime();
      return timeB - timeA;
    });

    return matched.map((rec): EvidenceItem => {
      const mime = (rec.mimeType || '').toLowerCase();
      const type: 'video' | 'audio' | 'photo' = mime.startsWith('video/')
        ? 'video'
        : mime.startsWith('audio/')
        ? 'audio'
        : mime.startsWith('image/')
        ? 'photo'
        : 'video';

      const captured = rec.capturedAt || rec.storedAt;
      let timestamp = 'Unknown date';
      if (captured) {
        try {
          const d = new Date(captured);
          if (!isNaN(d.getTime())) {
            timestamp = d.toLocaleString();
          }
        } catch {
          // ignore parsing error
        }
      }

      const hasCoords = typeof rec.lat === 'number' && typeof rec.lng === 'number' && (rec.lat !== 0 || rec.lng !== 0);
      const locationName = hasCoords ? `${rec.lat!.toFixed(4)}, ${rec.lng!.toFixed(4)}` : 'Location unavailable';
      const sizeMB = typeof rec.sizeBytes === 'number' ? `${(rec.sizeBytes / (1024 * 1024)).toFixed(1)} MB` : '0.0 MB';

      return {
        id: `cloud-${rec.id}`,
        serverId: rec.id,
        origin: 'cloud',
        title: rec.fileName || `Evidence ${rec.id.slice(0, 8)}`,
        type,
        timestamp,
        locationName,
        coords: { lat: rec.lat ?? 0, lng: rec.lng ?? 0 },
        fileSize: sizeMB,
        mediaUrl: '',
        isEncrypted: true,
        isCloudBackedUp: true,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Downloads and decrypts a cloud evidence item locally using the device's vault key.
 * Throws specific, structured error codes:
 * - NO_SERVER_ID
 * - TOO_LARGE
 * - DOWNLOAD_FAILED
 * - NO_KEY
 * - WRONG_KEY
 * - INTEGRITY_MISMATCH
 */
export async function openCloudEvidence(item: EvidenceItem): Promise<Blob> {
  // 1. Verify server ID
  if (!item.serverId) {
    throw new Error('NO_SERVER_ID');
  }

  // 2. Fetch metadata and signed download URL from server
  let recordRes: Response;
  try {
    recordRes = await fetch(`/api/evidence/vault/${encodeURIComponent(item.serverId)}`);
  } catch {
    throw new Error('DOWNLOAD_FAILED');
  }

  if (!recordRes.ok) {
    throw new Error('DOWNLOAD_FAILED');
  }

  const record: CloudVaultRecord | null = await recordRes.json().catch(() => null);
  if (!record || typeof record.downloadUrl !== 'string' || !record.ivBase64) {
    throw new Error('DOWNLOAD_FAILED');
  }

  // Refuse BEFORE downloading if ciphertext size exceeds safety cap
  if (typeof record.sizeBytes === 'number' && record.sizeBytes > MAX_CIPHERTEXT_BYTES) {
    throw new Error('TOO_LARGE');
  }

  // 3. Download the encrypted ciphertext
  let arrayBuffer: ArrayBuffer;
  try {
    const downloadRes = await fetch(record.downloadUrl);
    if (!downloadRes.ok) {
      throw new Error('DOWNLOAD_FAILED');
    }
    arrayBuffer = await downloadRes.arrayBuffer();
  } catch {
    throw new Error('DOWNLOAD_FAILED');
  }

  // 4. Retrieve the device's existing vault key (never generates a new key)
  const key = await getExistingVaultKey();
  if (!key) {
    throw new Error('NO_KEY');
  }

  // 5. Decrypt and verify integrity (decryptBlob throws WRONG_KEY or INTEGRITY_MISMATCH)
  return await decryptBlob(key, arrayBuffer, record.ivBase64, record.mimeType, record.sha256Hash);
}

