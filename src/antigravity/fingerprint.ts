export interface FingerprintHeaders {
  "X-Goog-QuotaUser": string;
  "X-Client-Device-Id": string;
}

const fingerprintCache = new Map<string, FingerprintHeaders>();

/**
 * Generates fingerprint headers for a refresh token using SHA-256 hashing.
 * @param refreshToken - The refresh token to generate headers for.
 * @returns Fingerprint headers with quota user and device ID.
 */
export async function getFingerprintHeaders(refreshToken: string): Promise<FingerprintHeaders> {
  const cached = fingerprintCache.get(refreshToken);
  if (cached) return cached;

  const hash = await hashString(refreshToken);
  const quotaUser = `device-${hash}`;
  const deviceId = hash.padEnd(32, '0');

  const headers: FingerprintHeaders = {
    "X-Goog-QuotaUser": quotaUser,
    "X-Client-Device-Id": deviceId,
  };

  fingerprintCache.set(refreshToken, headers);
  return headers;
}

/**
 * Removes fingerprint headers from the cache for a specific refresh token.
 * @param refreshToken - The refresh token to evict.
 */
export function evictFingerprint(refreshToken: string): void {
  fingerprintCache.delete(refreshToken);
}

/**
 * Clears the entire fingerprint cache.
 */
export function clearFingerprintCache(): void {
  fingerprintCache.clear();
}

/**
 * Generates a SHA-256 hash of the input string.
 * @param input - The string to hash.
 * @returns A 16-character hexadecimal string.
 */
async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
}
