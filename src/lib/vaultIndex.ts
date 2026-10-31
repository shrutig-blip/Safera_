const KEY = 'safera:my-evidence-ids';
const MAX_INDEX_ITEMS = 500;

/**
 * Returns the list of evidence IDs uploaded by this specific device/browser.
 */
export function getMyEvidenceIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0);
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Records an uploaded evidence ID into the device's local index.
 * Deduplicates and keeps the newest 500 IDs. Safely handles localStorage exceptions.
 */
export function addMyEvidenceId(id: string): void {
  if (!id || typeof id !== 'string') return;
  const trimmed = id.trim();
  if (!trimmed) return;

  try {
    const current = getMyEvidenceIds();
    const deduped = [trimmed, ...current.filter((existingId) => existingId !== trimmed)].slice(0, MAX_INDEX_ITEMS);
    localStorage.setItem(KEY, JSON.stringify(deduped));
  } catch {
    // Gracefully ignore quota / private mode storage errors
  }
}

