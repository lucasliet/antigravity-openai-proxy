/**
 * Cache for storing Claude thinking signatures.
 * Enables multi-turn conversations with thinking blocks by mapping
 * thought text to their corresponding signatures.
 */

interface SignatureEntry {
  signature: string;
  lastAccessedAt: number;
}

const MAX_SIGNATURES = 1000;
const signatureCache = new Map<string, SignatureEntry>();

/**
 * Stores a thinking signature in the cache.
 * Implements LRU eviction when cache is full.
 *
 * @param thoughtText - The thinking text to use as key.
 * @param signature - The signature to store.
 */
export function storeSignature(thoughtText: string, signature: string): void {
  if (signatureCache.size >= MAX_SIGNATURES) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of signatureCache) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      signatureCache.delete(oldestKey);
    }
  }

  signatureCache.set(thoughtText, {
    signature,
    lastAccessedAt: Date.now(),
  });
}

/**
 * Retrieves a signature for the given thought text.
 * Updates last access time for LRU eviction.
 *
 * @param thoughtText - The thinking text to look up.
 * @returns The signature if found, undefined otherwise.
 */
export function getSignature(thoughtText: string): string | undefined {
  const entry = signatureCache.get(thoughtText);
  if (entry) {
    entry.lastAccessedAt = Date.now();
    return entry.signature;
  }
  return undefined;
}

/**
 * Clears all signatures from the cache.
 */
export function clearSignatureCache(): void {
  signatureCache.clear();
}
