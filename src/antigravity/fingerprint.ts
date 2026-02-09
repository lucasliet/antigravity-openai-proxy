export interface FingerprintHeaders {
  "X-Goog-QuotaUser": string;
  "X-Client-Device-Id": string;
}

const fingerprintCache = new Map<string, FingerprintHeaders>();

export function getFingerprintHeaders(refreshToken: string): FingerprintHeaders {
  const cached = fingerprintCache.get(refreshToken);
  if (cached) return cached;

  const hash = hashString(refreshToken);
  const quotaUser = `device-${hash.slice(0, 16)}`;
  const deviceId = hash.slice(0, 32);

  const headers: FingerprintHeaders = {
    "X-Goog-QuotaUser": quotaUser,
    "X-Client-Device-Id": deviceId,
  };

  fingerprintCache.set(refreshToken, headers);
  return headers;
}

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(32, '0');
}
