/**
 * evidenceCrypto.ts
 *
 * Client-side AES-256-GCM encryption for the Evidence Vault, using the
 * browser's native Web Crypto API (no extra dependency needed — matches
 * this repo's existing pattern of zero-dependency lib/ helpers like
 * geocode.ts and routing.ts).
 *
 * A device-bound vault key is generated once and stored in localStorage.
 * Every recorded blob is encrypted with this key before it's uploaded —
 * the server (server.ts) only ever receives ciphertext.
 *
 * NOTE: this key is currently stored as raw bytes in localStorage, so
 * anyone with access to the unlocked browser/device can technically pull
 * it out of devtools. Wrapping it behind the vault PIN (like the rest of
 * the vault already gestures at) is a natural next step — flagged here
 * rather than assumed, since it changes the "Unlock Vault" flow too.
 */

const VAULT_KEY_STORAGE_KEY = 'safera:vault-key';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToUint8Array(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Returns the device's vault key, generating and persisting one on first use. */
export async function getOrCreateVaultKey(): Promise<CryptoKey> {
  const stored = localStorage.getItem(VAULT_KEY_STORAGE_KEY);

  if (stored) {
    const raw = base64ToUint8Array(stored);
    return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']);
  }

  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
  const exported = await crypto.subtle.exportKey('raw', key);
  localStorage.setItem(VAULT_KEY_STORAGE_KEY, arrayBufferToBase64(exported));
  return key;
}

export interface EncryptedBlobResult {
  ciphertextBase64: string;
  ivBase64: string;
  sha256Hash: string;
}

/** Hashes the plaintext (for tamper-proofing) then encrypts it with AES-256-GCM. */
export async function encryptBlob(vaultKey: CryptoKey, blob: Blob): Promise<EncryptedBlobResult> {
  const plaintext = await blob.arrayBuffer();

  const digest = await crypto.subtle.digest('SHA-256', plaintext);
  const sha256Hash = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, vaultKey, plaintext);

  return {
    ciphertextBase64: arrayBufferToBase64(ciphertext),
    ivBase64: arrayBufferToBase64(iv.buffer),
    sha256Hash,
  };
}
